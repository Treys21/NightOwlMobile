// ESPN play-by-play → per-player stat deltas.
//
// ESPN's site summary gives each play's text ("(Shotgun) J.Allen pass short
// right to D.Knox for 12 yards (J.Doe)."), down and distance, field position
// and the offense's team id; participant athlete ids appear only on some
// feeds. Names are resolved by ESPN id when present, otherwise by the
// abbreviated name on the team that had (or didn't have) the ball.
import type { EspnPlay, EspnSummary } from '../types/espn';
import type { ParsedPlay, PlayStatKey, RawPlayStatDelta } from '../types/play-feed';
import type { SlimNflPlayer } from '../types/sleeper';
import type { PlayerLookup } from './playerNormalizer';
import { normalizePlayerName, sleeperTeam } from './playerNormalizer';

/** "J.Allen", "A.St. Brown", "J.Smith-Njigba", "M.Harrison Jr." */
const NAME = String.raw`[A-Z][a-z]?\.\s?(?:St\.\s)?[A-Z][A-Za-z'’-]+(?:\s(?:Jr\.|Sr\.|II|III|IV|V)(?![A-Za-z]))?`;
const YARDS = String.raw`for (-?\d+) yards?|for no gain`;

export const passParser = new RegExp(String.raw`^(${NAME}) pass [^.]*?to (${NAME})(?:\s[^(]*?)? (?:${YARDS})`);
export const incompleteParser = new RegExp(String.raw`^(${NAME}) pass incomplete(?:[a-z ]*?to (${NAME}))?`);
export const interceptionParser = new RegExp(String.raw`^(${NAME}) pass .*?INTERCEPTED by (${NAME})`);
export const sackParser = new RegExp(String.raw`^(${NAME}) sacked (?:at [^(]*? )?(?:${YARDS})(?: \(([^)]*)\))?`);
export const rushParser = new RegExp(String.raw`^(${NAME}) (?!pass\b|sacked\b|punts\b|kicks\b|extra point\b|\d+ yard field goal)[^(]*?(?:${YARDS})`);
export const fumbleParser = new RegExp(String.raw`(?:(${NAME}) )?FUMBLES(?: \((${NAME})\))?`);
const recoveryParser = new RegExp(String.raw`(?:recovered|RECOVERED) by ([A-Z]{2,3})-(${NAME})`);
export const twoPtParser = /TWO-POINT CONVERSION ATTEMPT\. (.+?)\. ATTEMPT (SUCCEEDS|FAILS)/;

const NAME_ANYWHERE = new RegExp(NAME, 'g');
const PREAMBLE = new RegExp(String.raw`^(?:\([^)]*\)|${NAME} reported in as eligible\.|Direct snap to ${NAME}\.)\s*`);

/** Play types that never move a fantasy stat on this feed. */
const SKIP_TYPES = new Set([
  'Timeout',
  'Official Timeout',
  'End Period',
  'End of Half',
  'End of Game',
  'End of Regulation',
  'Two-minute warning',
  'Coin Toss',
  'Kickoff',
  'Punt',
  'Field Goal Good',
  'Field Goal Missed',
  'Blocked Field Goal',
  'Blocked Punt',
  'Extra Point Good',
  'Extra Point Missed'
]);

const yardsFrom = (m: RegExpExecArray, group: number): number => {
  const raw = m[group];
  return raw === undefined ? 0 : Number(raw);
};

/** Strip "(Shotgun)" style formation tags and anything before a replay reversal. */
export function cleanPlayText(text: string): string {
  let t = text.trim();
  const reversed = /REVERSED\.\s*(.*)$/s.exec(t);
  if (reversed?.[1]) t = reversed[1].trim();
  // Formation tags and preambles ("(Shotgun)", "C.Vinson reported in as
  // eligible.", "Direct snap to D.Henry.") come before the play itself.
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(PREAMBLE, '').trim();
  }
  return t;
}

/** Plays wiped out by penalty ("... - No Play.") or explicitly nullified. */
export const isNullified = (text: string): boolean => /No Play\.?\s*$|\bNULLIFIED\b/.test(text);

function ordinalDown(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

/** "3rd & 4 at BUF 28" from the snap's down, distance and field position. */
export function downAndDistance(play: EspnPlay, offense: string, defense: string): string {
  const start = play.start;
  if (!start || !start.down) return '';
  const yte = start.yardsToEndzone;
  const spot = yte === undefined ? '' : yte === 50 ? ' at 50' : yte < 50 ? ` at ${defense} ${yte}` : ` at ${offense} ${100 - yte}`;
  const distance = yte !== undefined && start.distance !== undefined && start.distance >= yte ? 'Goal' : String(start.distance ?? '');
  return `${ordinalDown(start.down)} & ${distance}${spot}`;
}

export interface GameTeams {
  gameId: string;
  /** ESPN team id → Sleeper team code */
  byId: Map<string, string>;
  home: string;
  away: string;
}

export function gameTeams(summary: EspnSummary, gameId: string): GameTeams {
  const competitors = summary.header?.competitions?.[0]?.competitors ?? [];
  const byId = new Map<string, string>();
  let home = '';
  let away = '';
  for (const c of competitors) {
    const code = sleeperTeam(c.team.abbreviation);
    byId.set(String(c.team.id), code);
    if (c.homeAway === 'home') home = code;
    else away = code;
  }
  return { gameId, byId, home, away };
}

/** All plays in a summary, oldest first, one per id. */
export function summaryPlays(summary: EspnSummary): EspnPlay[] {
  const seen = new Map<string, EspnPlay>();
  for (const drive of summary.drives?.previous ?? []) for (const p of drive.plays ?? []) seen.set(p.id, p);
  for (const p of summary.drives?.current?.plays ?? []) seen.set(p.id, p);
  return [...seen.values()].sort((a, b) => Number(a.sequenceNumber ?? 0) - Number(b.sequenceNumber ?? 0));
}

type Resolver = (abbr: string, team: string | null) => SlimNflPlayer | null;

/** Name resolution: ESPN participant id first, then name on the team. */
export function makeResolver(play: EspnPlay, lookup: PlayerLookup): Resolver {
  const byAbbr = new Map<string, string>();
  for (const part of play.participants ?? []) {
    const id = part.athlete?.id;
    const display = part.athlete?.displayName;
    if (!id || !display) continue;
    const [first = '', ...rest] = display.split(' ');
    byAbbr.set(normalizePlayerName(`${first.charAt(0)} ${rest.join(' ')}`), String(id));
  }
  return (abbr, team) => {
    const key = normalizePlayerName(abbr.replace('.', ' '));
    const espnId = byAbbr.get(key);
    if (espnId) {
      const hit = lookup.byEspnId(espnId);
      if (hit) return hit;
    }
    return lookup.byAbbreviation(abbr, team) ?? lookup.byNameTeam(abbr, team);
  };
}

class DeltaBag {
  private readonly byPlayer = new Map<string, RawPlayStatDelta>();

  add(player: SlimNflPlayer | null, abbr: string, team: string, key: PlayStatKey, value: number): void {
    if (!player || value === 0) return;
    let delta = this.byPlayer.get(player.player_id);
    if (!delta) {
      delta = { playerId: player.player_id, rawPlayerName: abbr, teamAbbr: team };
      if (player.espn_id) delta.espnAthleteId = player.espn_id;
      this.byPlayer.set(player.player_id, delta);
    }
    delta[key] = (delta[key] ?? 0) + value;
  }

  list(): RawPlayStatDelta[] {
    return [...this.byPlayer.values()];
  }
}

/** Defenders named in a trailing "(A.One, B.Two)" or "(A.One; B.Two)". */
const defendersIn = (group: string | undefined): string[] => (group ? group.match(NAME_ANYWHERE) ?? [] : []);

/** The tackle credit right after the yardage: "for 3 yards (N.Landman)." */
function tacklers(text: string, afterIndex: number): string[] {
  const rest = text.slice(afterIndex);
  const m = /^\s*\(([^)]*)\)/.exec(rest);
  return defendersIn(m?.[1]);
}

/** "BUF 25" / "50" → yards to the offense's end zone. */
function spotToEndzone(spot: string, offense: string): number | null {
  if (spot.trim() === '50') return 50;
  const m = /^([A-Z]{2,3}) (\d+)$/.exec(spot.trim());
  if (!m) return null;
  const yard = Number(m[2]);
  return sleeperTeam(m[1] ?? '') === offense ? 100 - yard : yard;
}

/**
 * An accepted offensive foul enforced past the line of scrimmage (holding
 * downfield) cuts the gain off at the spot of the foul, as the official
 * stats do: "for 9 yards ... PENALTY on LA-T.Higbee, Offensive Holding, 10
 * yards, enforced at BUF 25" credits only the yards to the BUF 25.
 */
export function creditedYards(play: EspnPlay, text: string, offense: string, yards: number): number {
  const m = /PENALTY on ([A-Z]{2,3})-[^,]*, [^,]*, \d+ yards?, enforced at ([A-Z]{2,3} \d+|50)(?! - No Play)/.exec(text);
  const los = play.start?.yardsToEndzone;
  if (!m || los === undefined || sleeperTeam(m[1] ?? '') !== offense) return yards;
  const spot = spotToEndzone(m[2] ?? '', offense);
  if (spot === null) return yards;
  const toSpot = los - spot;
  return toSpot >= 0 && toSpot < yards ? toSpot : yards;
}

/** One ESPN play → stat deltas for the passer, rusher, receiver and defenders. */
export function parsePlayStats(play: EspnPlay, teams: GameTeams, lookup: PlayerLookup): RawPlayStatDelta[] {
  const type = play.type?.text ?? '';
  const rawText = play.text ?? '';
  if (SKIP_TYPES.has(type) || !rawText || isNullified(rawText)) return [];
  const offense = teams.byId.get(String(play.start?.team?.id ?? '')) ?? '';
  const defense = offense === teams.home ? teams.away : offense === teams.away ? teams.home : '';
  if (!offense) return [];
  const resolve = makeResolver(play, lookup);
  const text = cleanPlayText(rawText);
  const bag = new DeltaBag();
  const off = (abbr: string, key: PlayStatKey, v: number): void => bag.add(resolve(abbr, offense), abbr, offense, key, v);
  const def = (abbr: string, key: PlayStatKey, v: number): void => bag.add(resolve(abbr, defense), abbr, defense, key, v);
  const distance = play.start?.distance ?? Infinity;
  // A touchdown after a turnover belongs to the defense, not the offense.
  const tdAt = /TOUCHDOWN NULLIFIED/.test(text) ? -1 : text.search(/\bTOUCHDOWN\b/);
  const turnoverAt = text.search(/\bFUMBLES\b|\bINTERCEPTED\b/);
  const touchdown = tdAt >= 0 && (turnoverAt < 0 || tdAt < turnoverAt);
  const defensiveTouchdown = tdAt >= 0 && turnoverAt >= 0 && tdAt > turnoverAt;
  let ballCarrier: string | null = null;

  const credit = (names: string[], yards: number): void => {
    if (names.length === 1) {
      const n = names[0] ?? '';
      def(n, 'idpTklSolo', 1);
      if (yards < 0) def(n, 'idpTklLoss', 1);
    } else {
      for (const n of names) {
        def(n, 'idpTklAst', 1);
        if (yards < 0) def(n, 'idpTklLoss', 1 / names.length);
      }
    }
  };

  let m: RegExpExecArray | null;
  if ((m = sackParser.exec(text))) {
    const passer = m[1] ?? '';
    off(passer, 'passSack', 1);
    const sackers = defendersIn(m[3]);
    for (const s of sackers) def(s, 'idpSack', 1 / sackers.length);
    ballCarrier = passer;
  } else if ((m = interceptionParser.exec(text))) {
    const passer = m[1] ?? '';
    const picker = m[2] ?? '';
    off(passer, 'passAtt', 1);
    off(passer, 'passInt', 1);
    def(picker, 'idpInt', 1);
    if (defensiveTouchdown) def(picker, 'idpTd', 1);
  } else if ((m = incompleteParser.exec(text))) {
    const passer = m[1] ?? '';
    off(passer, 'passAtt', 1);
    off(passer, 'passInc', 1);
    const target = m[2];
    if (target) {
      const after = text.indexOf(target) + target.length;
      for (const d of tacklers(text, after)) def(d, 'idpPassDef', 1);
    }
  } else if ((m = passParser.exec(text))) {
    const passer = m[1] ?? '';
    const receiver = m[2] ?? '';
    const yards = creditedYards(play, text, offense, yardsFrom(m, 3));
    const firstDown = yards >= distance ? 1 : 0;
    off(passer, 'passAtt', 1);
    off(passer, 'passCmp', 1);
    off(passer, 'passYds', yards);
    off(passer, 'passFirstDown', firstDown);
    off(receiver, 'rec', 1);
    off(receiver, 'recYds', yards);
    off(receiver, 'recFirstDown', firstDown);
    if (touchdown) {
      off(passer, 'passTd', 1);
      off(receiver, 'recTd', 1);
    } else {
      credit(tacklers(text, m.index + m[0].length), yards);
    }
    ballCarrier = receiver;
  } else if ((m = rushParser.exec(text))) {
    const rusher = m[1] ?? '';
    const yards = creditedYards(play, text, offense, yardsFrom(m, 2));
    off(rusher, 'rushAtt', 1);
    off(rusher, 'rushYds', yards);
    off(rusher, 'rushFirstDown', yards >= distance ? 1 : 0);
    if (touchdown) off(rusher, 'rushTd', 1);
    else credit(tacklers(text, m.index + m[0].length), yards);
    ballCarrier = rusher;
  }

  const f = fumbleParser.exec(text);
  if (f) {
    const fumbler = f[1] ?? ballCarrier;
    const recovery = recoveryParser.exec(text.slice(f.index));
    const recoveringTeam = recovery ? sleeperTeam(recovery[1] ?? '') : offense;
    if (fumbler) {
      off(fumbler, 'fum', 1);
      if (recoveringTeam !== offense) off(fumbler, 'fumLost', 1);
    }
    if (f[2]) def(f[2], 'idpFf', 1);
    if (recovery && recoveringTeam === defense) {
      def(recovery[2] ?? '', 'idpFr', 1);
      if (defensiveTouchdown) def(recovery[2] ?? '', 'idpTd', 1);
    }
  }

  const two = twoPtParser.exec(text);
  if (two && two[2] === 'SUCCEEDS') {
    const attempt = two[1] ?? '';
    const pass = new RegExp(String.raw`^(${NAME}) pass to (${NAME})`).exec(attempt);
    const rush = new RegExp(String.raw`^(${NAME}) rushes`).exec(attempt);
    if (pass) {
      off(pass[1] ?? '', 'pass2Pt', 1);
      off(pass[2] ?? '', 'rec2Pt', 1);
    } else if (rush) {
      off(rush[1] ?? '', 'rush2Pt', 1);
    }
  }

  return bag.list();
}

/** One ESPN play → a ParsedPlay (stat deltas plus game context). */
export function parsePlay(play: EspnPlay, teams: GameTeams, lookup: PlayerLookup, now: number): ParsedPlay {
  const offense = teams.byId.get(String(play.start?.team?.id ?? '')) ?? '';
  const defense = offense === teams.home ? teams.away : teams.home;
  const yte = play.start?.yardsToEndzone;
  const wall = Date.parse(play.wallclock ?? '');
  return {
    playId: play.id,
    gameId: teams.gameId,
    sequenceNumber: Number(play.sequenceNumber ?? 0),
    timestamp: Number.isFinite(wall) ? wall : now,
    awayTeam: teams.away,
    homeTeam: teams.home,
    awayScore: play.awayScore ?? 0,
    homeScore: play.homeScore ?? 0,
    quarter: play.period?.number ?? 0,
    clock: play.clock?.displayValue ?? '',
    downAndDistance: downAndDistance(play, offense, defense),
    isScoringPlay: play.scoringPlay === true,
    isRedZonePlay: yte !== undefined && yte > 0 && yte <= 20,
    description: (play.text ?? '').trim(),
    statDeltas: parsePlayStats(play, teams, lookup)
  };
}

/** Every play in a game summary, parsed. */
export function parseSummary(summary: EspnSummary, gameId: string, lookup: PlayerLookup, now: number): ParsedPlay[] {
  const teams = gameTeams(summary, gameId);
  return summaryPlays(summary).map((p) => parsePlay(p, teams, lookup, now));
}
