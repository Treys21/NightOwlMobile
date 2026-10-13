// ESPN scoreboard, injury and prop feeds → Night Owl's shapes. Ported from
// the extension's lineups/alerts/bets modules; pure.
import type {
  EspnInjuryFeed,
  EspnPropBet,
  EspnScoreboard,
  EspnScoreboardEvent,
  EspnStatus,
  NflGame
} from '../types/espn';
import type { SleeperScheduleGame } from '../types/sleeper';
import type { NormalizedPlayerProp } from '../types/vegas';
import { sleeperTeam } from './playerNormalizer';
import { emptyProp } from './vegasCalculator';

/** Share of a game still to play from ESPN's period and clock. Overtime counts as nearly over. */
export function remainingShare(status: EspnStatus | undefined): number {
  const state = status?.type?.state ?? 'pre';
  if (state === 'pre') return 1;
  if (state === 'post') return 0;
  const period = status?.period ?? 1;
  if (period > 4) return 0.02;
  const clock = Math.max(0, Math.min(900, Number(status?.clock) || 0));
  return ((4 - period) * 900 + clock) / 3600;
}

export function parseScoreboardEvent(e: EspnScoreboardEvent): NflGame {
  const comp = e.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const away = competitors.find((c) => c.homeAway === 'away');
  const home = competitors.find((c) => c.homeAway === 'home');
  const odds = comp?.odds?.[0];
  const state = e.status?.type?.state ?? 'pre';
  return {
    id: e.id,
    kickoff: Date.parse(e.date),
    away: sleeperTeam(away?.team.abbreviation ?? ''),
    home: sleeperTeam(home?.team.abbreviation ?? ''),
    awayScore: Number(away?.score ?? 0) || 0,
    homeScore: Number(home?.score ?? 0) || 0,
    state,
    started: state !== 'pre',
    remaining: remainingShare(e.status),
    quarter: e.status?.period ?? 0,
    clock: e.status?.displayClock ?? '',
    isDome: comp?.venue?.indoor === true,
    odds: odds ? { details: odds.details ?? '', overUnder: typeof odds.overUnder === 'number' ? odds.overUnder : null } : null,
    isRedZone: comp?.situation?.isRedZone === true
  };
}

/** Scoreboard → games sorted by kickoff, plus the week's bye teams. */
export function parseScoreboard(board: EspnScoreboard | null | undefined): { games: NflGame[]; teamsOnBye: string[]; week: number | null } {
  const games = (board?.events ?? []).map(parseScoreboardEvent).sort((a, b) => a.kickoff - b.kickoff);
  const teamsOnBye = (board?.week?.teamsOnBye ?? []).map((t) => sleeperTeam(t.abbreviation));
  return { games, teamsOnBye, week: board?.week?.number ?? null };
}

/** Fallback when ESPN is down: Sleeper's schedule has dates only, so each day starts at 1 PM ET. */
export function gamesFromSchedule(schedule: SleeperScheduleGame[], week: number): NflGame[] {
  return schedule
    .filter((g) => g.week === week)
    .map((g): NflGame => {
      const state: NflGame['state'] = g.status === 'pre_game' ? 'pre' : g.status === 'complete' ? 'post' : 'in';
      return {
        id: g.game_id,
        kickoff: Date.parse(`${g.date}T13:00:00-04:00`),
        away: g.away,
        home: g.home,
        awayScore: 0,
        homeScore: 0,
        state,
        started: state !== 'pre',
        remaining: state === 'pre' ? 1 : state === 'post' ? 0 : 0.5,
        quarter: 0,
        clock: '',
        isDome: false,
        odds: null,
        isRedZone: false
      };
    })
    .sort((a, b) => a.kickoff - b.kickoff);
}

export interface KickoffWindow {
  kickoff: number;
  games: NflGame[];
  teams: Set<string>;
  started: boolean;
}

/** Games sharing a kickoff time form one window ("Sun 1:00 PM · 7 games"). */
export function kickoffWindows(games: NflGame[]): KickoffWindow[] {
  const out: KickoffWindow[] = [];
  for (const g of games) {
    let w = out[out.length - 1];
    if (!w || w.kickoff !== g.kickoff) {
      w = { kickoff: g.kickoff, games: [], teams: new Set(), started: g.started };
      out.push(w);
    }
    w.games.push(g);
    w.teams.add(g.home).add(g.away);
    w.started = w.started && g.started;
  }
  return out;
}

/** team → kickoff ms for the week's games. Teams absent from the map are on bye. */
export function kickoffByTeam(games: NflGame[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of games) {
    out.set(g.home, g.kickoff);
    out.set(g.away, g.kickoff);
  }
  return out;
}

/** ESPN injuries feed → espnAthleteId → { status, note }. */
export function parseInjuries(feed: EspnInjuryFeed | null | undefined): Map<string, { status: string; note: string }> {
  const out = new Map<string, { status: string; note: string }>();
  for (const team of feed?.injuries ?? []) {
    for (const item of team.injuries ?? []) {
      const athlete = item.athlete ?? {};
      const link = (athlete.links ?? []).map((l) => l.href ?? '').find((h) => /\/id\/\d+/.test(h)) ?? '';
      const id = athlete.id ?? /\/id\/(\d+)/.exec(link)?.[1];
      if (id) out.set(String(id), { status: item.status ?? '', note: item.shortComment ?? '' });
    }
  }
  return out;
}

/** ESPN prop type names ("Total Receptions (incl. overtime)") → the prop field they fill. */
const OVER_UNDER_FIELDS: Record<string, 'passYdsLine' | 'passTdLine' | 'passIntLine' | 'rushYdsLine' | 'recLine' | 'recYdsLine'> = {
  'Total Passing Yards (incl. overtime)': 'passYdsLine',
  'Total Passing Touchdowns (incl. overtime)': 'passTdLine',
  'Total Passing Interceptions (incl. overtime)': 'passIntLine',
  'Total Rushing Yards (incl. overtime)': 'rushYdsLine',
  'Total Receptions (incl. overtime)': 'recLine',
  'Total Receiving Yards (incl. overtime)': 'recYdsLine'
};

/**
 * DraftKings props for one game (keyless, via ESPN) → props keyed by Sleeper
 * player id. ESPN publishes the line but not the price, so odds stay null and
 * Sleeper Picks payouts fill them in later (mergePicksIntoProp).
 */
export function propsFromEspn(
  items: EspnPropBet[],
  game: NflGame,
  sleeperIdForEspn: (espnId: string) => { playerId: string; team: string | null } | null
): NormalizedPlayerProp[] {
  const byPlayer = new Map<string, NormalizedPlayerProp>();
  for (const it of items) {
    const field = OVER_UNDER_FIELDS[it.type?.name ?? ''];
    const value = it.current?.target?.value;
    const espnId = /athletes\/(\d+)/.exec(it.athlete?.$ref ?? '')?.[1];
    if (!field || value === undefined || !espnId) continue;
    const who = sleeperIdForEspn(espnId);
    if (!who) continue;
    let prop = byPlayer.get(who.playerId);
    if (!prop) {
      const team = who.team ?? '';
      const opponent = team === game.home ? game.away : team === game.away ? game.home : '';
      prop = emptyProp(who.playerId, game.id, team, opponent);
      byPlayer.set(who.playerId, prop);
    }
    prop[field] = value;
    const updated = Date.parse(it.lastUpdated ?? '');
    if (Number.isFinite(updated)) prop.updatedAtMs = Math.max(prop.updatedAtMs, updated);
  }
  return [...byPlayer.values()];
}
