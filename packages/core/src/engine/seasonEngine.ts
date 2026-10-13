// Season math, ported from the Chrome extension's Season tool.
//
//   all-play  your record if you'd played every team every week
//   luck      actual wins minus the wins your weekly scores "deserved"
//   max       the best lineup you could have set (Sleeper's "max points")
//   win %     chance to win a live matchup from points so far + projections
//   draft     next year's order: worst first, on wins and max points
//   power     0-100 rating from record, scoring, consistency and form
import type { FantasyPosition, RosterSlotType, SleeperMatchup, SleeperRoster, SleeperTradedPick } from '../types/sleeper';
import { NON_STARTING_SLOTS } from './invertedIndex';
import { assign, canPlay } from './lineupOptimizer';
import { round2 } from './scoringEngine';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const points = (whole: number | undefined, decimal: number | undefined): number => (whole ?? 0) + (decimal ?? 0) / 100;

/** Week → { rosterId: points } for completed weeks. */
export type WeekScores = Record<string, number | null>;

/** Best lineup on actual points. */
export function optimalLineup(
  slots: readonly RosterSlotType[],
  pids: readonly string[],
  pointsOf: (pid: string) => number,
  positionsOf: (pid: string) => FantasyPosition[]
): { points: number; starters: Array<string | null> } {
  const starting = slots.filter((s) => !NON_STARTING_SLOTS.has(s));
  const pool = pids.map((pid) => ({ pid, pts: pointsOf(pid) || 0, positions: positionsOf(pid) }));
  const picks = assign(starting, pool, (slot, p) => (canPlay(slot, p.positions) ? p.pts : null));
  return { points: round2(picks.reduce((sum, p) => sum + (p ? p.pts : 0), 0)), starters: picks.map((p) => (p ? p.pid : null)) };
}

export interface AllPlayRecord {
  w: number;
  l: number;
  t: number;
  /** Σ share of the league outscored each week (+ median wins). */
  expected: number;
}

export function allPlay(weeks: WeekScores[], { medianGame = false } = {}): Record<string, AllPlayRecord> {
  const out: Record<string, AllPlayRecord> = {};
  for (const week of weeks) {
    const ids = Object.keys(week).filter((id) => week[id] !== null && week[id] !== undefined);
    const score = (id: string): number => week[id] ?? 0;
    for (const id of ids) {
      const rec = (out[id] ??= { w: 0, l: 0, t: 0, expected: 0 });
      let beat = 0;
      for (const other of ids) {
        if (other === id) continue;
        if (score(id) > score(other)) {
          rec.w++;
          beat++;
        } else if (score(id) < score(other)) rec.l++;
        else {
          rec.t++;
          beat += 0.5;
        }
      }
      if (ids.length > 1) rec.expected += beat / (ids.length - 1);
      if (medianGame && ids.length > 1) {
        const above = ids.filter((other) => score(other) > score(id)).length;
        const half = ids.length / 2;
        rec.expected += above < half - (ids.length % 2 ? 0.5 : 0) ? 1 : 0;
      }
    }
  }
  for (const rec of Object.values(out)) rec.expected = round2(rec.expected);
  return out;
}

export interface StandingsRow {
  rosterId: number;
  ownerId: string | null;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  max: number | null;
  efficiency: number | null;
  allPlay: AllPlayRecord;
  luck: number | null;
  rank: number;
}

/** Ranked like Sleeper (wins, then points for), with all-play, luck and efficiency. */
export function standings(rosters: SleeperRoster[], weeks: WeekScores[], options: { medianGame?: boolean } = {}): StandingsRow[] {
  const ap = allPlay(weeks, options);
  const rows: StandingsRow[] = rosters.map((r) => {
    const s = r.settings;
    const pf = points(s.fpts, s.fpts_decimal);
    const max = points(s.ppts, s.ppts_decimal);
    const rec = ap[String(r.roster_id)] ?? { w: 0, l: 0, t: 0, expected: 0 };
    const wins = s.wins ?? 0;
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      wins,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      pf: round2(pf),
      pa: round2(points(s.fpts_against, s.fpts_against_decimal)),
      max: max ? round2(max) : null,
      efficiency: max ? pf / max : null,
      allPlay: rec,
      luck: weeks.length ? round1(wins + (s.ties ?? 0) / 2 - rec.expected) : null,
      rank: 0
    };
  });
  rows.sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pf - a.pf);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function phi(z: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** A player's final score is roughly normal around projection, spread ~half of it. */
const SPREAD = 0.5;

export interface SideOutlook {
  mean: number;
  variance: number;
}

/** starters: points so far, projection, share of game left (0 when final or bye). */
export function outlook(starters: Array<{ points: number; proj: number; remaining: number }>): SideOutlook {
  let mean = 0;
  let variance = 0;
  for (const s of starters) {
    const left = Math.max(0, Math.min(1, s.remaining || 0));
    const proj = Math.max(0, s.proj || 0);
    mean += (s.points || 0) + proj * left;
    variance += (SPREAD * proj) ** 2 * left;
  }
  return { mean: round2(mean), variance };
}

export function winProbability(me: SideOutlook, opp: SideOutlook): number {
  const sd = Math.sqrt(me.variance + opp.variance);
  if (sd === 0) return me.mean > opp.mean ? 1 : me.mean < opp.mean ? 0 : 0.5;
  return phi((me.mean - opp.mean) / sd);
}

/** mulberry32, so odds don't jitter between refreshes. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashSeed = (text: string): number =>
  [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

/** Scoring mean and spread from weekly scores, pulled toward the league average early on. */
export function teamStrength(weeks: WeekScores[], rosterId: number): { mean: number; sd: number } {
  const all = weeks.flatMap((w) => Object.values(w)).filter((v): v is number => v !== null && v !== undefined);
  const leagueMean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 100;
  const mine = weeks.map((w) => w[String(rosterId)]).filter((v): v is number => v !== null && v !== undefined);
  const n = mine.length;
  const avg = n ? mine.reduce((a, b) => a + b, 0) / n : leagueMean;
  const PRIOR = 3;
  const mean = (avg * n + leagueMean * PRIOR) / (n + PRIOR);
  const sd = Math.max(leagueMean * 0.12, n > 1 ? Math.sqrt(mine.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1)) : leagueMean * 0.18);
  return { mean, sd };
}

export interface SimTeam {
  rosterId: number;
  wins: number;
  ties: number;
  pf: number;
  mean: number;
  sd: number;
}

/** Chance each team makes the playoffs, by simulating the rest of the season. */
export function playoffOdds({
  teams,
  schedule,
  playoffTeams,
  medianGame = false,
  sims = 2000,
  seed = 1
}: {
  teams: SimTeam[];
  schedule: Array<Array<[number, number]>>;
  playoffTeams: number;
  medianGame?: boolean;
  sims?: number;
  seed?: number;
}): Record<number, number> {
  const made: Record<number, number> = Object.fromEntries(teams.map((t) => [t.rosterId, 0]));
  if (!playoffTeams || !teams.length) return made;
  const rand = seededRandom(seed);
  const normal = (): number => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
  const ids = new Set(teams.map((t) => t.rosterId));
  for (let s = 0; s < sims; s++) {
    const wins = new Map(teams.map((t) => [t.rosterId, t.wins + t.ties / 2]));
    const pf = new Map(teams.map((t) => [t.rosterId, t.pf]));
    for (const week of schedule) {
      const score = new Map<number, number>();
      for (const t of teams) {
        const v = Math.max(0, t.mean + t.sd * normal());
        score.set(t.rosterId, v);
        pf.set(t.rosterId, (pf.get(t.rosterId) ?? 0) + v);
      }
      for (const [a, b] of week) {
        if (!ids.has(a) || !ids.has(b)) continue;
        const winner = (score.get(a) ?? 0) >= (score.get(b) ?? 0) ? a : b;
        wins.set(winner, (wins.get(winner) ?? 0) + 1);
      }
      if (medianGame) {
        const order = [...score.entries()].sort((x, y) => y[1] - x[1]);
        for (let i = 0; i < Math.floor(order.length / 2); i++) {
          const id = order[i]?.[0];
          if (id !== undefined) wins.set(id, (wins.get(id) ?? 0) + 1);
        }
      }
    }
    const ranked = teams
      .map((t) => t.rosterId)
      .sort((a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0) || (pf.get(b) ?? 0) - (pf.get(a) ?? 0));
    for (let i = 0; i < Math.min(playoffTeams, ranked.length); i++) {
      const id = ranked[i];
      if (id !== undefined) made[id] = (made[id] ?? 0) + 1;
    }
  }
  for (const id of Object.keys(made)) made[Number(id)] = (made[Number(id)] ?? 0) / sims;
  return made;
}

/** Fold a live week into season totals as if every game ended now. */
export function asItStands(
  rosters: SleeperRoster[],
  matchups: SleeperMatchup[],
  maxOf: (rosterId: number) => number | null,
  { medianGame = false } = {}
): SleeperRoster[] {
  const pts = new Map(matchups.map((m) => [m.roster_id, m.points || 0]));
  const result = new Map(matchups.map((m) => [m.roster_id, { w: 0, l: 0, t: 0, against: 0 }]));
  const pairs = new Map<number, number[]>();
  for (const m of matchups) {
    if (m.matchup_id === null) continue;
    const list = pairs.get(m.matchup_id) ?? [];
    list.push(m.roster_id);
    pairs.set(m.matchup_id, list);
  }
  for (const [a, b] of pairs.values()) {
    if (a === undefined || b === undefined) continue;
    const pa = pts.get(a) ?? 0;
    const pb = pts.get(b) ?? 0;
    const ra = result.get(a);
    const rb = result.get(b);
    if (!ra || !rb) continue;
    ra[pa > pb ? 'w' : pa < pb ? 'l' : 't']++;
    rb[pb > pa ? 'w' : pb < pa ? 'l' : 't']++;
    ra.against += pb;
    rb.against += pa;
  }
  if (medianGame) {
    const order = [...pts.entries()].sort((x, y) => y[1] - x[1]);
    order.forEach(([id], i) => {
      const r = result.get(id);
      if (r) r[i < Math.floor(order.length / 2) ? 'w' : 'l']++;
    });
  }
  return rosters.map((r) => {
    const s = r.settings;
    const add = result.get(r.roster_id) ?? { w: 0, l: 0, t: 0, against: 0 };
    const max = maxOf(r.roster_id);
    return {
      ...r,
      settings: {
        ...s,
        wins: (s.wins ?? 0) + add.w,
        losses: (s.losses ?? 0) + add.l,
        ties: (s.ties ?? 0) + add.t,
        fpts: points(s.fpts, s.fpts_decimal) + (pts.get(r.roster_id) ?? 0),
        fpts_decimal: 0,
        fpts_against: points(s.fpts_against, s.fpts_against_decimal) + add.against,
        fpts_against_decimal: 0,
        ...(max === null ? {} : { ppts: points(s.ppts, s.ppts_decimal) + max, ppts_decimal: 0 })
      }
    };
  });
}

/** Weeks already in Sleeper's records (two games a week with a median game). */
export function weeksRecorded(rosters: SleeperRoster[], { medianGame = false } = {}): number {
  const games = Math.max(0, ...rosters.map((r) => (r.settings.wins ?? 0) + (r.settings.losses ?? 0) + (r.settings.ties ?? 0)));
  return Math.floor(games / (medianGame ? 2 : 1));
}

export const DRAFT_WIN_WEIGHT = 0.3;

const minMax = (values: number[]): number[] => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0));
};

export interface DraftOrderTeam {
  rosterId: number;
  wins: number;
  max: number | null;
}

export interface DraftOrderRow extends DraftOrderTeam {
  pick: number;
  score: number;
  winScore: number;
  maxScore: number;
}

/**
 * Next year's draft order, worst first: 0.3 × wins + 0.7 × max points, each
 * scaled 0 (best) … 1 (worst). 'linear' is min-max; 'inverse' takes
 * reciprocals first so the bottom teams pull ahead.
 */
export function draftOrder(teams: DraftOrderTeam[], { method = 'linear', winWeight = DRAFT_WIN_WEIGHT }: { method?: 'linear' | 'inverse'; winWeight?: number } = {}): DraftOrderRow[] {
  if (!teams.length) return [];
  const wins = teams.map((t) => t.wins || 0);
  const maxes = teams.map((t) => t.max || 0);
  let winScores: number[];
  let maxScores: number[];
  if (method === 'inverse') {
    const top = Math.max(...wins);
    const best = Math.max(...maxes);
    winScores = minMax(wins.map((w) => (top + 1) / (w + 1)));
    const inverted = maxes.map((m) => (m > 0 ? best / m : null));
    const worst = Math.max(1, ...inverted.filter((v): v is number => v !== null));
    maxScores = minMax(inverted.map((v) => v ?? worst));
  } else {
    winScores = minMax(wins.map((w) => -w));
    maxScores = minMax(maxes.map((m) => -m));
  }
  return teams
    .map((t, i) => {
      const winScore = winScores[i] ?? 0;
      const maxScore = maxScores[i] ?? 0;
      return { ...t, winScore, maxScore, score: winWeight * winScore + (1 - winWeight) * maxScore, pick: 0 };
    })
    .sort((a, b) => b.score - a.score || (a.wins || 0) - (b.wins || 0) || (a.max || 0) - (b.max || 0) || a.rosterId - b.rosterId)
    .map((t, i) => ({ ...t, pick: i + 1 }));
}

/** (round, rosterId) → roster that holds that pick now, after trades. */
export function pickOwners(tradedPicks: SleeperTradedPick[], season: string): (round: number, rosterId: number) => number {
  const owners = new Map<string, number>();
  for (const p of tradedPicks) if (String(p.season) === String(season)) owners.set(`${p.round}:${p.roster_id}`, p.owner_id);
  return (round, rosterId) => owners.get(`${round}:${rosterId}`) ?? rosterId;
}

const percentile = (value: number, all: number[]): number => {
  const below = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  return all.length ? (below + equal / 2) / all.length : 0.5;
};

/** 0–100: 35% record, 35% points per week, 15% consistency, 15% form (last 3, 3-2-1). */
export function powerRatings(rows: Array<Pick<StandingsRow, 'rosterId' | 'wins' | 'losses' | 'ties'>>, weeks: WeekScores[]): Record<number, number> {
  const stats = rows.map((r) => {
    const scores = weeks.map((w) => w[String(r.rosterId)]).filter((v): v is number => v !== null && v !== undefined);
    const games = r.wins + r.losses + r.ties;
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const sd = scores.length > 1 ? Math.sqrt(scores.reduce((a, b) => a + (b - avg) ** 2, 0) / scores.length) : 0;
    const last = scores.slice(-3);
    const form = last.length === 3 ? ((last[2] ?? 0) * 3 + (last[1] ?? 0) * 2 + (last[0] ?? 0)) / 6 : avg;
    return { id: r.rosterId, pct: games ? (r.wins + r.ties / 2) / games : 0, avg, sd, form };
  });
  const pcts = stats.map((s) => s.pct);
  const avgs = stats.map((s) => s.avg);
  const sds = stats.map((s) => s.sd);
  const out: Record<number, number> = {};
  for (const s of stats) {
    const consistency = Math.max(...sds) > 0 ? 1 - percentile(s.sd, sds) : 0.5;
    const rating = 0.35 * percentile(s.pct, pcts) + 0.35 * percentile(s.avg, avgs) + 0.15 * consistency + 0.15 * percentile(s.form, avgs);
    out[s.id] = round1(rating * 100);
  }
  return out;
}
