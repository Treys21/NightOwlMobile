// Rest-of-season projection (ported from the Chrome extension's
// season/project.js): play out the remaining regular season and the playoffs
// a few thousand times from each team's projected lineups, and read off final
// records, playoff / bye / title odds, the draft order and a projected bracket.
//
// The model, per team per week:
//   mean      the best lineup the roster can set on projected points
//   variance  each starter's score is roughly normal around his projection
//             with a spread of about half of it (seasonEngine.outlook)
//   actual    a draw of that lineup, times the team's lineup efficiency
//             (points scored / max points so far); max points take the full draw
// A week already being played is passed in with lineupSet: its mean is the
// real starters' points so far plus what's left of their games.
import type { FantasyPosition, RosterSlotType } from '../types/sleeper';
import { DRAFT_WIN_WEIGHT, draftOrder, optimalLineup, outlook, phi, seededRandom } from './seasonEngine';
import type { DraftOrderRow } from './seasonEngine';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Statuses that keep a player out of every remaining week, and ones that only cost him the next game. */
export const OUT_FOR_SEASON: ReadonlySet<string> = new Set(['IR', 'PUP', 'Sus', 'NA']);
export const OUT_THIS_WEEK: ReadonlySet<string> = new Set(['Out', 'Doubtful']);

export const DEFAULT_EFFICIENCY = 0.92;
const clampEfficiency = (e: number | null | undefined): number =>
  e === null || e === undefined || !Number.isFinite(e) ? DEFAULT_EFFICIENCY : Math.max(0.8, Math.min(1, e));

export interface TeamWeekOutlook {
  mean: number;
  variance: number;
  /** The week is under way with its real lineup: no efficiency haircut. */
  lineupSet?: boolean;
}

/** One team's projected week: the best lineup on projections, players who are out excluded. */
export function teamWeek(
  slots: readonly RosterSlotType[],
  pool: readonly string[],
  projOf: (pid: string) => number,
  positionsOf: (pid: string) => FantasyPosition[],
  isOut: (pid: string) => boolean
): TeamWeekOutlook & { starters: string[] } {
  const best = optimalLineup(slots, pool, (pid) => (isOut(pid) ? 0 : projOf(pid)), positionsOf);
  const starters = best.starters.filter((p): p is string => p !== null);
  const o = outlook(starters.map((pid) => ({ points: 0, proj: isOut(pid) ? 0 : projOf(pid), remaining: 1 })));
  return { mean: o.mean, variance: o.variance, starters };
}

/** Who can't play in a given remaining week (index 0 = the next one). */
export function availability(injuryOf: (pid: string) => string | null | undefined): (weekIndex: number) => (pid: string) => boolean {
  return (weekIndex) => (pid) => {
    const status = injuryOf(pid) ?? '';
    return OUT_FOR_SEASON.has(status) || (weekIndex === 0 && OUT_THIS_WEEK.has(status));
  };
}

// ---- playoff bracket ------------------------------------------------------

export interface BracketRound {
  round: number;
  label: string;
  weeks: number[];
}

export interface BracketFormat {
  rounds: BracketRound[];
  /** First-round pairs by seed; null = bye. */
  firstRound: Array<[number, number | null]>;
}

/** Bracket slot order for a power of two: 1, 8, 4, 5, 2, 7, 3, 6 for 8. */
export function slotOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/**
 * Sleeper's standard bracket: top seeds get byes until the field is a power
 * of two, no reseeding. roundType is playoff_round_type: 0 one week a round,
 * 1 two-week final, 2 two weeks every round.
 */
export function bracketFormat(playoffTeams: number, playoffStart: number, roundType = 0): BracketFormat | null {
  if (!playoffTeams || playoffTeams < 2) return null;
  const rounds = Math.ceil(Math.log2(playoffTeams));
  const order = slotOrder(2 ** rounds);
  const firstRound: Array<[number, number | null]> = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i] ?? 0;
    const b = order[i + 1] ?? 0;
    firstRound.push([a, b <= playoffTeams ? b : null]);
  }
  const out: BracketRound[] = [];
  let week = playoffStart;
  for (let r = 1; r <= rounds; r++) {
    const final = r === rounds;
    const span = roundType === 2 || (roundType === 1 && final) ? 2 : 1;
    const weeks = Array.from({ length: span }, (_, i) => week + i);
    week += span;
    const left = rounds - r;
    out.push({ round: r, label: final ? 'Championship' : left === 1 ? 'Semifinals' : left === 2 ? 'Quarterfinals' : `Round ${r}`, weeks });
  }
  return { rounds: out, firstRound };
}

export const playoffWeeks = (format: BracketFormat | null): number[] => (format ? format.rounds.flatMap((r) => r.weeks) : []);

// ---- simulation -----------------------------------------------------------

export interface ProjectionTeam {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  max: number;
  efficiency: number | null;
}

export interface ProjectionWeek {
  week: number;
  pairs: Array<[number, number]>;
  teams: Record<number, TeamWeekOutlook>;
}

export interface TeamProjection {
  rosterId: number;
  /** Average final wins (ties count half), losses, points for and max points. */
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  max: number;
  avgRank: number;
  seedOdds: number[];
  playoffOdds: number;
  byeOdds: number;
  finalOdds: number;
  titleOdds: number;
  pickOdds: number[] | null;
  avgPick: number | null;
}

export interface BracketSide {
  seed: number;
  rosterId: number;
  points: number;
}

export interface BracketMatch {
  top: BracketSide | null;
  bottom: BracketSide | null;
  /** Chance the top team advances. */
  pTop: number;
}

export interface ProjectedBracket {
  rounds: Array<BracketRound & { matches: BracketMatch[] }>;
  champion: { seed: number; rosterId: number } | null;
}

export interface SeasonProjection {
  teams: Record<number, TeamProjection>;
  /** Roster ids by projected finish (average place). */
  order: number[];
  bracket: ProjectedBracket | null;
}

export interface ProjectSeasonInput {
  teams: ProjectionTeam[];
  weeks: ProjectionWeek[];
  playoff?: { format: BracketFormat; teams: Record<number, Record<number, TeamWeekOutlook>> } | null;
  medianGame?: boolean;
  sims?: number;
  seed?: number;
  draft?: { method: 'linear' | 'inverse'; winWeight?: number } | null;
}

const rankTeams = (ids: number[], wins: Map<number, number>, pf: Map<number, number>): number[] =>
  ids.slice().sort((a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0) || (pf.get(b) ?? 0) - (pf.get(a) ?? 0) || a - b);

export function projectSeason({ teams, weeks, playoff = null, medianGame = false, sims = 2000, seed = 1, draft = null }: ProjectSeasonInput): SeasonProjection {
  const ids = teams.map((t) => t.rosterId);
  const eff = new Map(teams.map((t) => [t.rosterId, clampEfficiency(t.efficiency)]));
  const effOf = (id: number): number => eff.get(id) ?? DEFAULT_EFFICIENCY;
  const known = new Set(ids);
  const rand = seededRandom(seed);
  let spare: number | null = null;
  const normal = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const r = Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12)));
    const v = rand();
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  const draw = (o: TeamWeekOutlook | undefined): number => (o ? Math.max(0, o.mean + Math.sqrt(o.variance) * normal()) : 0);

  const format = playoff?.format ?? null;
  const playoffTeams = format ? Math.min(ids.length, format.firstRound.flat().filter((s) => s !== null).length) : 0;
  const acc = new Map(
    ids.map((id) => [
      id,
      {
        wins: 0, losses: 0, pf: 0, max: 0, rank: 0, playoffs: 0, bye: 0, final: 0, title: 0, pick: 0,
        seeds: new Array<number>(ids.length + 1).fill(0),
        picks: new Array<number>(ids.length + 1).fill(0)
      }
    ])
  );
  const get = (id: number) => {
    const a = acc.get(id);
    if (!a) throw new Error(`unknown roster ${id}`);
    return a;
  };
  const inc = (m: Map<number, number>, id: number, by: number): void => {
    m.set(id, (m.get(id) ?? 0) + by);
  };

  for (let s = 0; s < sims; s++) {
    const wins = new Map(teams.map((t) => [t.rosterId, t.wins + t.ties / 2]));
    const losses = new Map(teams.map((t) => [t.rosterId, t.losses]));
    const pf = new Map(teams.map((t) => [t.rosterId, t.pf]));
    const max = new Map(teams.map((t) => [t.rosterId, t.max]));

    for (const wk of weeks) {
      const score = new Map<number, number>();
      for (const id of ids) {
        const o = wk.teams[id];
        const full = draw(o);
        const actual = o?.lineupSet ? full : full * effOf(id);
        score.set(id, actual);
        inc(pf, id, actual);
        inc(max, id, full);
      }
      for (const [a, b] of wk.pairs) {
        if (!known.has(a) || !known.has(b)) continue;
        const aWins = (score.get(a) ?? 0) >= (score.get(b) ?? 0);
        inc(wins, aWins ? a : b, 1);
        inc(losses, aWins ? b : a, 1);
      }
      if (medianGame) {
        const order = ids.slice().sort((x, y) => (score.get(y) ?? 0) - (score.get(x) ?? 0));
        order.forEach((id, i) => inc(i < Math.floor(order.length / 2) ? wins : losses, id, 1));
      }
    }

    const ranked = rankTeams(ids, wins, pf);
    ranked.forEach((id, i) => {
      const a = get(id);
      a.rank += i + 1;
      a.seeds[i + 1] = (a.seeds[i + 1] ?? 0) + 1;
      if (i < playoffTeams) a.playoffs++;
    });

    if (format && playoff && playoffTeams >= 2) {
      const seedOf = (n: number): number | null => (n <= playoffTeams ? (ranked[n - 1] ?? null) : null);
      let alive: Array<[number | null, number | null]> = format.firstRound.map(([a, b]) => [seedOf(a), b === null ? null : seedOf(b)]);
      for (const [a, b] of alive) if (b === null && a !== null) get(a).bye++;
      format.rounds.forEach((round, r) => {
        const total = (id: number): number => round.weeks.reduce((sum, w) => sum + draw(playoff.teams[w]?.[id]) * effOf(id), 0);
        const winners = alive.map(([a, b]): number | null => {
          if (b === null) return a;
          if (a === null) return b;
          const sa = total(a);
          const sb = total(b);
          return sa > sb || (sa === sb && ranked.indexOf(a) < ranked.indexOf(b)) ? a : b;
        });
        if (r === format.rounds.length - 1) {
          const [a, b] = alive[0] ?? [null, null];
          if (a !== null) get(a).final++;
          if (b !== null) get(b).final++;
          const champ = winners[0];
          if (champ !== null && champ !== undefined) get(champ).title++;
        }
        const next: Array<[number | null, number | null]> = [];
        for (let i = 0; i < winners.length; i += 2) next.push([winners[i] ?? null, winners[i + 1] ?? null]);
        alive = next;
      });
    }

    if (draft) {
      const picks = draftOrder(
        ids.map((id) => ({ rosterId: id, wins: wins.get(id) ?? 0, max: max.get(id) ?? 0 })),
        draft
      );
      for (const p of picks) {
        const a = get(p.rosterId);
        a.picks[p.pick] = (a.picks[p.pick] ?? 0) + 1;
        a.pick += p.pick;
      }
    }

    for (const id of ids) {
      const a = get(id);
      a.wins += wins.get(id) ?? 0;
      a.losses += losses.get(id) ?? 0;
      a.pf += pf.get(id) ?? 0;
      a.max += max.get(id) ?? 0;
    }
  }

  const out: Record<number, TeamProjection> = {};
  for (const t of teams) {
    const a = get(t.rosterId);
    out[t.rosterId] = {
      rosterId: t.rosterId,
      wins: round1(a.wins / sims),
      losses: round1(a.losses / sims),
      ties: t.ties,
      pf: round2(a.pf / sims),
      max: round2(a.max / sims),
      avgRank: round2(a.rank / sims),
      seedOdds: a.seeds.slice(1).map((n) => n / sims),
      playoffOdds: a.playoffs / sims,
      byeOdds: a.bye / sims,
      finalOdds: a.final / sims,
      titleOdds: a.title / sims,
      pickOdds: draft ? a.picks.slice(1).map((n) => n / sims) : null,
      avgPick: draft ? round2(a.pick / sims) : null
    };
  }
  const proj = (id: number): TeamProjection => {
    const p = out[id];
    if (!p) throw new Error(`unknown roster ${id}`);
    return p;
  };
  const order = ids.slice().sort((x, y) => proj(x).avgRank - proj(y).avgRank || proj(y).wins - proj(x).wins || x - y);
  return {
    teams: out,
    order,
    bracket: format && playoff ? chalkBracket(format, order.slice(0, playoffTeams), playoff.teams, eff) : null
  };
}

/** The bracket if every game goes to the favorite, with each side's projected points and win chance. */
export function chalkBracket(
  format: BracketFormat,
  seeds: number[],
  weekly: Record<number, Record<number, TeamWeekOutlook>>,
  eff: ReadonlyMap<number, number>
): ProjectedBracket {
  type Slot = { seed: number; rosterId: number } | null;
  const seedOf = (n: number): Slot => {
    const rosterId = seeds[n - 1];
    return n <= seeds.length && rosterId !== undefined ? { seed: n, rosterId } : null;
  };
  let alive: Array<[Slot, Slot]> = format.firstRound.map(([a, b]) => [seedOf(a), b === null ? null : seedOf(b)]);
  const rounds: ProjectedBracket['rounds'] = [];
  for (const round of format.rounds) {
    const stats = (side: Slot): { mean: number; variance: number } | null => {
      if (!side) return null;
      const e = eff.get(side.rosterId) ?? DEFAULT_EFFICIENCY;
      let mean = 0;
      let variance = 0;
      for (const w of round.weeks) {
        const o = weekly[w]?.[side.rosterId];
        if (o) {
          mean += o.mean * e;
          variance += o.variance * e * e;
        }
      }
      return { mean: round1(mean), variance };
    };
    const matches: BracketMatch[] = alive.map(([a, b]) => {
      const sa = stats(a);
      const sb = stats(b);
      let pTop = a ? 1 : 0;
      if (a && b && sa && sb) {
        const sd = Math.sqrt(sa.variance + sb.variance);
        pTop = sd > 0 ? phi((sa.mean - sb.mean) / sd) : sa.mean >= sb.mean ? 1 : 0;
      }
      return {
        top: a && sa ? { ...a, points: sa.mean } : null,
        bottom: b && sb ? { ...b, points: sb.mean } : null,
        pTop: round2(pTop)
      };
    });
    rounds.push({ ...round, matches });
    const winners: Slot[] = matches.map((m) => {
      const w = m.bottom === null ? m.top : m.top === null ? m.bottom : m.pTop >= 0.5 ? m.top : m.bottom;
      return w ? { seed: w.seed, rosterId: w.rosterId } : null;
    });
    const next: Array<[Slot, Slot]> = [];
    for (let i = 0; i < winners.length; i += 2) next.push([winners[i] ?? null, winners[i + 1] ?? null]);
    alive = next;
  }
  const last = rounds[rounds.length - 1]?.matches[0];
  const champ = !last ? null : last.bottom === null ? last.top : last.top === null ? last.bottom : last.pTop >= 0.5 ? last.top : last.bottom;
  return { rounds, champion: champ ? { seed: champ.seed, rosterId: champ.rosterId } : null };
}

export interface ProjectedPick extends DraftOrderRow {
  odds: number[] | null;
  avgPick: number | null;
}

/** Expected-value draft order: the formula on projected final wins (ties already half) and max points. */
export function projectedDraft(projection: SeasonProjection, { method = 'linear', winWeight = DRAFT_WIN_WEIGHT }: { method?: 'linear' | 'inverse'; winWeight?: number } = {}): ProjectedPick[] {
  const rows = Object.values(projection.teams);
  const picks = draftOrder(rows.map((t) => ({ rosterId: t.rosterId, wins: t.wins, max: t.max })), { method, winWeight });
  return picks.map((p) => {
    const t = projection.teams[p.rosterId];
    return { ...p, odds: t?.pickOdds ?? null, avgPick: t?.avgPick ?? null };
  });
}
