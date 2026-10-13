// Canonical player names so ESPN, sportsbooks and Sleeper agree on who is
// who: lowercase, accents and punctuation stripped, generational suffixes
// dropped, and common nicknames mapped to one spelling. Both sides of every
// comparison go through the same function, so the map only has to be
// consistent, not "correct".
import type { FantasyPosition, SleeperRawPlayer, SlimNflPlayer, InjuryStatus } from '../types/sleeper';
import { FANTASY_POSITIONS } from '../types/sleeper';

const NICKNAME_MAP: Record<string, string> = {
  'hollywood brown': 'marquise brown',
  'tank dell': 'nathaniel dell',
  'bucky irving': 'markeise irving',
  'chig okonkwo': 'chigoziem okonkwo',
  'gabe davis': 'gabriel davis',
  'josh palmer': 'joshua palmer',
  'bam knight': 'zonovan knight',
  'sauce gardner': 'ahmad gardner',
  'kenny gainwell': 'kenneth gainwell',
  'scotty miller': 'scott miller',
  'cam ward': 'cameron ward'
};

export function normalizePlayerName(raw: string): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.`-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return NICKNAME_MAP[cleaned] ?? cleaned;
}

/** Last-name key for "J.Smith-Njigba" style abbreviations: "smithnjigba". */
export function normalizeLastName(raw: string): string {
  return normalizePlayerName(raw).replace(/ /g, '');
}

const POSITION_SET = new Set<string>(FANTASY_POSITIONS);
const isFantasyPosition = (p: string | null | undefined): p is FantasyPosition => !!p && POSITION_SET.has(p);

const INJURY: Record<string, InjuryStatus> = {
  Out: 'Out',
  Doubtful: 'Doubtful',
  Questionable: 'Questionable',
  IR: 'IR',
  PUP: 'PUP',
  Sus: 'Sus',
  Cov: 'Cov',
  NA: 'NA'
};

/** Sleeper team codes for ESPN abbreviations that differ. */
export const ESPN_TO_SLEEPER_TEAM: Record<string, string> = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' };
export const sleeperTeam = (abbr: string): string => ESPN_TO_SLEEPER_TEAM[abbr] ?? abbr;

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * One /players/nfl row → the slim record the app stores, or null when the
 * player isn't an active fantasy position. Defenses keep "City Nickname".
 */
export function toSlimPlayer(id: string, p: SleeperRawPlayer): SlimNflPlayer | null {
  if (p.active !== true || !isFantasyPosition(p.position)) return null;
  const first = p.first_name ?? '';
  const last = p.last_name ?? '';
  const full = p.position === 'DEF' ? `${first} ${last}`.trim() : (p.full_name ?? `${first} ${last}`.trim());
  const positions = (p.fantasy_positions ?? []).filter(isFantasyPosition);
  return {
    player_id: id,
    espn_id: p.espn_id === null || p.espn_id === undefined ? null : String(p.espn_id),
    full_name: full,
    first_name: first,
    last_name: last,
    normalized_name: normalizePlayerName(full || `${first}${last}`),
    position: p.position,
    fantasy_positions: positions.length ? positions : [p.position],
    team: p.team ?? null,
    injury_status: p.injury_status ? (INJURY[p.injury_status] ?? null) : null,
    injury_notes: p.injury_notes ?? null,
    number: toNumber(p.number),
    age: p.age ?? null,
    years_exp: p.years_exp ?? null,
    search_rank: p.search_rank ?? null
  };
}

/** The whole /players/nfl map → slim players, active fantasy positions only. */
export function slimPlayerDirectory(raw: Record<string, SleeperRawPlayer>): SlimNflPlayer[] {
  const out: SlimNflPlayer[] = [];
  for (const [id, p] of Object.entries(raw)) {
    const slim = toSlimPlayer(id, p);
    if (slim) out.push(slim);
  }
  return out.sort((a, b) => (a.search_rank ?? 1e9) - (b.search_rank ?? 1e9) || a.player_id.localeCompare(b.player_id));
}

/** Placeholder-free stand-in for an id the directory doesn't know yet (new signings, team defenses). */
export function unknownPlayer(id: string): SlimNflPlayer {
  const isDefense = /^[A-Z]{2,3}$/.test(id);
  return {
    player_id: id,
    espn_id: null,
    full_name: isDefense ? `${id} Defense` : `Player ${id}`,
    first_name: '',
    last_name: '',
    normalized_name: normalizePlayerName(isDefense ? `${id} defense` : id),
    position: isDefense ? 'DEF' : 'WR',
    fantasy_positions: isDefense ? ['DEF'] : [],
    team: isDefense ? id : null,
    injury_status: null,
    injury_notes: null,
    number: null,
    age: null,
    years_exp: null,
    search_rank: null
  };
}

export interface PlayerLookup {
  byId: (id: string) => SlimNflPlayer | null;
  byEspnId: (espnId: string) => SlimNflPlayer | null;
  /** Full display name ("Josh Allen") on a team. */
  byNameTeam: (name: string, team: string | null) => SlimNflPlayer | null;
  /** Play-by-play abbreviation ("J.Allen", "A.St. Brown") on a team. */
  byAbbreviation: (abbr: string, team: string | null) => SlimNflPlayer | null;
}

/** Indexes for resolving names from ESPN and sportsbooks to Sleeper ids. */
export function buildPlayerLookup(players: Iterable<SlimNflPlayer>): PlayerLookup {
  const ids = new Map<string, SlimNflPlayer>();
  const espn = new Map<string, SlimNflPlayer>();
  const nameTeam = new Map<string, SlimNflPlayer[]>();
  const lastTeam = new Map<string, SlimNflPlayer[]>();
  const push = (m: Map<string, SlimNflPlayer[]>, k: string, p: SlimNflPlayer): void => {
    const list = m.get(k);
    if (list) list.push(p);
    else m.set(k, [p]);
  };
  for (const p of players) {
    ids.set(p.player_id, p);
    if (p.espn_id) espn.set(p.espn_id, p);
    push(nameTeam, `${p.normalized_name}|${p.team ?? ''}`, p);
    push(nameTeam, `${p.normalized_name}|*`, p);
    if (p.last_name) push(lastTeam, `${normalizeLastName(p.last_name)}|${p.team ?? ''}`, p);
  }

  const single = (list: SlimNflPlayer[] | undefined): SlimNflPlayer | null => (list && list.length === 1 ? (list[0] ?? null) : null);

  return {
    byId: (id) => ids.get(id) ?? null,
    byEspnId: (id) => espn.get(String(id)) ?? null,
    byNameTeam: (name, team) => {
      const key = normalizePlayerName(name);
      if (team) {
        const onTeam = single(nameTeam.get(`${key}|${sleeperTeam(team)}`));
        if (onTeam) return onTeam;
      }
      return single(nameTeam.get(`${key}|*`));
    },
    byAbbreviation: (abbr, team) => {
      const m = /^([A-Z][A-Za-z]?)\.\s?(.+)$/.exec(abbr.trim());
      if (!m || !team) return null;
      const initial = (m[1] ?? '').toLowerCase();
      const last = normalizeLastName(m[2] ?? '');
      const candidates = (lastTeam.get(`${last}|${sleeperTeam(team)}`) ?? []).filter((p) =>
        normalizePlayerName(p.first_name).replace(/ /g, '').startsWith(initial)
      );
      if (candidates.length <= 1) return candidates[0] ?? null;
      // Two "J.Williams" on one team: the higher-ranked one is the likelier ball carrier.
      return [...candidates].sort((a, b) => (a.search_rank ?? 1e9) - (b.search_rank ?? 1e9))[0] ?? null;
    }
  };
}
