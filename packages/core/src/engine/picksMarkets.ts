// Sleeper Picks over/unders and DraftKings milestone ladders, ported from
// the Chrome extension's Bets tool: market parsing, de-vigged over chance,
// hit rate over recent games, live progress and defense-vs-position ranks.
import type { SleeperPicksEntry, SleeperStatRow, StatLine } from '../types/sleeper';
import type { EspnPropBet } from '../types/espn';
import type { PicksMarket } from '../types/vegas';

const round1 = (n: number): number => Math.round(n * 10) / 10;

interface MarketMeta {
  label: string;
  keys: string[];
  td?: boolean;
  max?: boolean;
}

/** Sleeper wager_type → label and the stat keys (summed) that settle it. */
export const MARKETS: Record<string, MarketMeta> = {
  passing_yards: { label: 'Pass yds', keys: ['pass_yd'] },
  passing_touchdowns: { label: 'Pass TDs', keys: ['pass_td'] },
  pass_completions: { label: 'Completions', keys: ['pass_cmp'] },
  passing_attempts: { label: 'Pass att', keys: ['pass_att'] },
  interceptions: { label: 'INTs thrown', keys: ['pass_int'] },
  longest_passing_completion: { label: 'Longest comp', keys: ['pass_lng'], max: true },
  passing_and_rushing_yards: { label: 'Pass + rush yds', keys: ['pass_yd', 'rush_yd'] },
  rushing_yards: { label: 'Rush yds', keys: ['rush_yd'] },
  rushing_attempts: { label: 'Carries', keys: ['rush_att'] },
  longest_rush: { label: 'Longest rush', keys: ['rush_lng'], max: true },
  receiving_yards: { label: 'Rec yds', keys: ['rec_yd'] },
  receptions: { label: 'Receptions', keys: ['rec'] },
  longest_reception: { label: 'Longest rec', keys: ['rec_lng'], max: true },
  rushing_and_receiving_yards: { label: 'Rush + rec yds', keys: ['rush_yd', 'rec_yd'] },
  anytime_touchdowns: { label: 'Anytime TD', keys: ['rush_td', 'rec_td', 'def_td', 'st_td'], td: true },
  first_touchdown: { label: 'First TD', keys: [], td: true },
  kicking_points: { label: 'Kicking pts', keys: ['kick_pts'] },
  field_goal_made: { label: 'FGs made', keys: ['fgm'] },
  extra_point_made: { label: 'XPs made', keys: ['xpm'] },
  sacks: { label: 'Sacks', keys: ['idp_sack'] },
  tackles: { label: 'Solo tackles', keys: ['idp_tkl_solo'] },
  assists: { label: 'Ast tackles', keys: ['idp_tkl_ast'] },
  tackles_and_assists: { label: 'Tackles + ast', keys: ['idp_tkl_solo', 'idp_tkl_ast'] }
};
const ORDER = Object.keys(MARKETS);
const orderOf = (type: string): number => ORDER.indexOf(type);

/** DraftKings milestone ladders (via ESPN) → the same stat keys. */
export const MILESTONES: Record<string, { label: string; keys: string[] }> = {
  'Receiving Yards Milestones': { label: 'Rec yds', keys: ['rec_yd'] },
  'Rushing Yards Milestones': { label: 'Rush yds', keys: ['rush_yd'] },
  'Receptions Milestones': { label: 'Receptions', keys: ['rec'] },
  'Passing Yards Milestones': { label: 'Pass yds', keys: ['pass_yd'] },
  'Rushing + Receiving Yards Milestones': { label: 'Rush + rec yds', keys: ['rush_yd', 'rec_yd'] },
  'Passing Touchdown Milestones': { label: 'Pass TDs', keys: ['pass_td'] },
  'Rushing Attempts Milestones': { label: 'Carries', keys: ['rush_att'] }
};

/** Value of a market from a stat line; null when the line has none of the keys. */
export function statValue(stats: StatLine | null | undefined, keys: readonly string[]): number | null {
  if (!stats || !keys.length) return null;
  let total = 0;
  let seen = false;
  for (const k of keys) {
    const v = stats[k];
    if (v !== undefined && v !== null) {
      total += v;
      seen = true;
    }
  }
  return seen ? round1(total) : null;
}

/** Pick'em payouts → probability of the over, house margin removed when both sides are priced. */
export function impliedOver(overMult: number | null, underMult: number | null): number | null {
  const o = overMult ? 1 / overMult : null;
  const u = underMult ? 1 / underMult : null;
  if (o !== null && u !== null) return o / (o + u);
  if (o !== null) return Math.min(1, o);
  if (u !== null) return Math.max(0, 1 - u);
  return null;
}

const num = (v: string | number | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** /lines/available (every sport) → { sleeperPlayerId: markets } for the NFL, newest per type. */
export function parsePicksLines(raw: SleeperPicksEntry[] | null | undefined): Record<string, PicksMarket[]> {
  const grouped: Record<string, PicksMarket[]> = {};
  for (const entry of raw ?? []) {
    const first = entry.options?.[0];
    if (!first || first.sport !== 'nfl' || entry.subject_type !== 'player') continue;
    const meta = MARKETS[entry.wager_type];
    if (!meta) continue;
    const over = entry.options.find((o) => o.outcome === 'over');
    const under = entry.options.find((o) => o.outcome === 'under');
    const line = num((over ?? under ?? first).outcome_value);
    if (line === null) continue;
    const overMult = over ? num(over.payout_multiplier) : null;
    const underMult = under ? num(under.payout_multiplier) : null;
    const pid = String(entry.subject_id);
    (grouped[pid] ??= []).push({
      type: entry.wager_type,
      label: meta.label,
      keys: meta.keys,
      td: !!meta.td,
      max: !!meta.max,
      line,
      over: overMult,
      under: underMult,
      pOver: impliedOver(overMult, underMult),
      recent: (entry.recent_performance?.values ?? []).slice(-10),
      gameId: entry.game_id ?? null,
      updatedAt: entry.updated_at ?? 0
    });
  }
  const out: Record<string, PicksMarket[]> = {};
  for (const [pid, markets] of Object.entries(grouped)) {
    const best = new Map<string, PicksMarket>();
    for (const m of markets) {
      const cur = best.get(m.type);
      if (!cur || m.updatedAt > cur.updatedAt) best.set(m.type, m);
    }
    out[pid] = [...best.values()].sort((a, b) => orderOf(a.type) - orderOf(b.type));
  }
  return out;
}

/** Lines vanish at kickoff; keep the last known (closing) one per player and market. */
export function mergePicksLines(
  previous: Record<string, PicksMarket[]>,
  fresh: Record<string, PicksMarket[]>
): Record<string, PicksMarket[]> {
  const out: Record<string, PicksMarket[]> = { ...previous };
  for (const [pid, markets] of Object.entries(fresh)) {
    const byType = new Map((out[pid] ?? []).map((m) => [m.type, m]));
    for (const m of markets) byType.set(m.type, m);
    out[pid] = [...byType.values()].sort((a, b) => orderOf(a.type) - orderOf(b.type));
  }
  return out;
}

/** How often the player cleared this line in the games Sleeper lists. */
export function hitRate(recent: PicksMarket['recent'], line: number): { over: number; games: number } | null {
  const values = recent.map((r) => r.value).filter((v): v is number => v !== null && v !== undefined);
  if (!values.length) return null;
  return { over: values.filter((v) => v > line).length, games: values.length };
}

export interface MarketProgress {
  value: number;
  line: number;
  /** Share of the line reached, 0..1. */
  pct: number;
  hit: boolean;
}

/** Where a market stands live. In the game with no stat yet counts as zero. */
export function marketProgress(market: PicksMarket, liveStats: StatLine | null | undefined): MarketProgress | null {
  if (!market.keys.length || !liveStats) return null;
  const value = statValue(liveStats, market.keys) ?? 0;
  const line = market.td ? 0.5 : market.line;
  return { value, line, pct: line > 0 ? Math.min(1, value / line) : value > 0 ? 1 : 0, hit: value > line };
}

export interface MilestoneLadder {
  label: string;
  keys: string[];
  rungs: number[];
}

/** ESPN propBets items → { espnAthleteId: ladders }. */
export function parseMilestones(items: EspnPropBet[] | null | undefined): Record<string, MilestoneLadder[]> {
  const byAthlete = new Map<string, Map<string, { label: string; keys: string[]; rungs: Set<number> }>>();
  for (const it of items ?? []) {
    const meta = MILESTONES[it.type?.name ?? ''];
    const target = it.current?.target?.value;
    const id = /athletes\/(\d+)/.exec(it.athlete?.$ref ?? '')?.[1];
    if (!meta || target === undefined || !id) continue;
    let ladders = byAthlete.get(id);
    if (!ladders) {
      ladders = new Map();
      byAthlete.set(id, ladders);
    }
    let ladder = ladders.get(meta.label);
    if (!ladder) {
      ladder = { label: meta.label, keys: meta.keys, rungs: new Set() };
      ladders.set(meta.label, ladder);
    }
    ladder.rungs.add(Number(target));
  }
  const out: Record<string, MilestoneLadder[]> = {};
  for (const [id, ladders] of byAthlete) {
    out[id] = [...ladders.values()].map((l) => ({ label: l.label, keys: l.keys, rungs: [...l.rungs].sort((a, b) => a - b) }));
  }
  return out;
}

/** A ladder can run 16 rungs; keep the `max` closest to the player's line. */
export function trimRungs(rungs: number[], line: number | null, max = 6): number[] {
  if (rungs.length <= max) return rungs.slice();
  const center = line ?? rungs[Math.floor(rungs.length / 2)] ?? 0;
  return rungs
    .slice()
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b)
    .slice(0, max)
    .sort((a, b) => a - b);
}

export type DefenseRanks = Record<string, Partial<Record<'QB' | 'RB' | 'WR' | 'TE' | 'K', { rank: number; perGame: number }>>>;

/** Season DEF rows → rank 1 = allows the most fantasy points per game to that position. */
export function defenseRanks(defRows: SleeperStatRow[] | null | undefined): DefenseRanks {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K'] as const;
  const per = (row: SleeperStatRow, pos: string): number => {
    const games = row.stats.gp || 1;
    return (row.stats[`fan_pts_allow_${pos.toLowerCase()}`] ?? 0) / games;
  };
  const out: DefenseRanks = {};
  for (const pos of positions) {
    [...(defRows ?? [])]
      .filter((r) => r.stats && r.stats.gp)
      .sort((a, b) => per(b, pos) - per(a, pos))
      .forEach((r, i) => {
        const team = (out[r.player_id] ??= {});
        team[pos] = { rank: i + 1, perGame: round1(per(r, pos)) };
      });
  }
  return out;
}

const KEY_BY_POS: Record<string, string[]> = {
  QB: ['passing_yards', 'passing_and_rushing_yards', 'passing_touchdowns'],
  RB: ['rushing_yards', 'rushing_and_receiving_yards', 'receptions'],
  WR: ['receiving_yards', 'receptions', 'rushing_and_receiving_yards'],
  TE: ['receiving_yards', 'receptions'],
  K: ['kicking_points', 'field_goal_made']
};

/** The one line that best sums a player up in a collapsed row. */
export function keyMarket(markets: PicksMarket[] | undefined, pos: string): PicksMarket | null {
  const list = (markets ?? []).filter((m) => !m.td);
  for (const type of KEY_BY_POS[pos] ?? []) {
    const m = list.find((x) => x.type === type);
    if (m) return m;
  }
  return list[0] ?? null;
}

/** "4 rec · 38 yds so far" for a player with no line to track. */
export function liveLine(pos: string, stats: StatLine | null | undefined): string {
  const LIVE: Record<string, Array<[string, string]>> = {
    QB: [['pass_yd', 'pass yds'], ['pass_td', 'TD'], ['rush_yd', 'rush yds']],
    RB: [['rush_yd', 'rush yds'], ['rec', 'rec'], ['rush_td', 'TD']],
    WR: [['rec', 'rec'], ['rec_yd', 'yds'], ['rec_td', 'TD']],
    TE: [['rec', 'rec'], ['rec_yd', 'yds'], ['rec_td', 'TD']],
    K: [['fgm', 'FG'], ['xpm', 'XP']]
  };
  const parts = (LIVE[pos] ?? [])
    .filter(([key], i) => i < 2 || !!stats?.[key])
    .map(([key, label]) => `${Math.round(stats?.[key] ?? 0)} ${label}`);
  return parts.length ? `${parts.join(' · ')} so far` : '';
}

/** 1st, 2nd, 3rd, 4th … */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
