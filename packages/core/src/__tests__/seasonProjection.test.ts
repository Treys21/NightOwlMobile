// Same cases as the Chrome extension's test/season-projection.test.js.
import { describe, expect, it } from 'vitest';
import {
  availability,
  bracketFormat,
  chalkBracket,
  playoffWeeks,
  projectSeason,
  projectedDraft,
  teamWeek
} from '../engine/seasonProjection';
import type { FantasyPosition } from '../types/sleeper';
import type { ProjectionTeam, ProjectionWeek, TeamWeekOutlook } from '../engine/seasonProjection';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('bracketFormat', () => {
  it("matches Sleeper's: byes to the top seeds, no reseeding", () => {
    const six = bracketFormat(6, 15, 0);
    expect(six?.firstRound).toEqual([[1, null], [4, 5], [2, null], [3, 6]]);
    expect(six?.rounds.map((r) => [r.label, r.weeks])).toEqual([['Quarterfinals', [15]], ['Semifinals', [16]], ['Championship', [17]]]);
    expect(bracketFormat(4, 15)?.firstRound).toEqual([[1, 4], [2, 3]]);
    expect(bracketFormat(8, 15)?.firstRound).toEqual([[1, 8], [4, 5], [2, 7], [3, 6]]);
    expect(bracketFormat(4, 15, 1)?.rounds.map((r) => r.weeks)).toEqual([[15], [16, 17]]);
    expect(playoffWeeks(bracketFormat(4, 14, 2))).toEqual([14, 15, 16, 17]);
    expect(bracketFormat(0, 15)).toBeNull();
  });
});

describe('teamWeek and availability', () => {
  it('starts the best projected lineup and skips players who are out', () => {
    const proj: Record<string, number> = { qb: 20, rb1: 15, rb2: 12, rb3: 14, wr: 10 };
    const pos: Record<string, FantasyPosition[]> = { qb: ['QB'], rb1: ['RB'], rb2: ['RB'], rb3: ['RB'], wr: ['WR'] };
    const week = teamWeek(['QB', 'RB', 'WR', 'BN'], Object.keys(proj), (p) => proj[p] ?? 0, (p) => pos[p] ?? [], (p) => p === 'rb1');
    expect(week.starters.sort()).toEqual(['qb', 'rb3', 'wr']);
    expect(week.mean).toBe(44);
    expect(week.variance).toBeCloseTo(100 + 49 + 25, 9);
    const avail = availability((p) => ({ a: 'IR', b: 'Out', c: 'Questionable' })[p as 'a' | 'b' | 'c']);
    expect(avail(3)('a')).toBe(true);
    expect(avail(0)('b')).toBe(true);
    expect(avail(1)('b')).toBe(false);
    expect(avail(0)('c')).toBe(false);
  });
});

const strength: Record<number, number> = { 1: 150, 2: 110, 3: 110, 4: 70 };
const outlooks = (): Record<number, TeamWeekOutlook> => Object.fromEntries(Object.entries(strength).map(([id, m]) => [Number(id), { mean: m, variance: 100 }]));
const wk = (week: number, pairs: Array<[number, number]>): ProjectionWeek => ({ week, pairs, teams: outlooks() });
const TEAMS: ProjectionTeam[] = [
  { rosterId: 1, wins: 4, losses: 1, ties: 0, pf: 600, max: 650, efficiency: 1 },
  { rosterId: 2, wins: 3, losses: 2, ties: 0, pf: 550, max: 600, efficiency: 1 },
  { rosterId: 3, wins: 3, losses: 2, ties: 0, pf: 540, max: 590, efficiency: 1 },
  { rosterId: 4, wins: 0, losses: 5, ties: 0, pf: 400, max: 450, efficiency: 1 }
];
const format = bracketFormat(2, 8, 0);
const run = (extra: Partial<Parameters<typeof projectSeason>[0]> = {}) =>
  projectSeason({
    teams: TEAMS,
    weeks: [wk(6, [[1, 4], [2, 3]]), wk(7, [[1, 2], [3, 4]])],
    playoff: format ? { format, teams: { 8: outlooks() } } : null,
    sims: 3000,
    seed: 7,
    draft: { method: 'linear' },
    ...extra
  });

describe('projectSeason', () => {
  it('keeps its books: records, odds and picks add up', () => {
    const p = run();
    const t = (id: number) => p.teams[id]!;
    for (const id of [1, 2, 3, 4]) {
      expect(t(id).wins + t(id).losses).toBeCloseTo(7, 9);
      expect(sum(t(id).seedOdds)).toBeCloseTo(1, 9);
      expect(sum(t(id).pickOdds ?? [])).toBeCloseTo(1, 9);
    }
    expect(sum([1, 2, 3, 4].map((id) => t(id).playoffOdds))).toBeCloseTo(2, 9);
    expect(sum([1, 2, 3, 4].map((id) => t(id).titleOdds))).toBeCloseTo(1, 9);
    expect(sum([1, 2, 3, 4].map((id) => t(id).finalOdds))).toBeCloseTo(2, 9);
    expect(t(1).wins).toBeGreaterThan(5.9);
    expect(t(1).titleOdds).toBeGreaterThan(0.85);
    expect(t(4).playoffOdds).toBeLessThan(0.01);
    // 2 and 3 are even today, but 3 still plays team 4 while 2 plays team 1.
    expect(p.order).toEqual([1, 3, 2, 4]);
    expect(t(4).pickOdds?.[0]).toBeGreaterThan(0.99);
    expect(run().teams).toEqual(p.teams);
  });

  it('scales points for by efficiency; max points take the full lineup', () => {
    const p = run({ teams: TEAMS.map((x) => (x.rosterId === 2 ? { ...x, efficiency: 0.8 } : x)) });
    expect(Math.abs(p.teams[2]!.max - 600 - 220)).toBeLessThan(6);
    expect(Math.abs(p.teams[2]!.pf - 550 - 176)).toBeLessThan(6);
  });

  it('adds a median game every week', () => {
    const p = run({ medianGame: true });
    expect(p.teams[1]!.wins + p.teams[1]!.losses).toBeCloseTo(9, 9);
  });

  it('gives a week under way no efficiency haircut', () => {
    const live: ProjectionWeek = { week: 6, pairs: [[1, 4], [2, 3]], teams: { 1: { mean: 100, variance: 0, lineupSet: true }, 2: { mean: 100, variance: 0, lineupSet: true }, 3: { mean: 100, variance: 0, lineupSet: true }, 4: { mean: 100, variance: 0, lineupSet: true } } };
    const p = run({ weeks: [live], teams: TEAMS.map((x) => ({ ...x, efficiency: 0.8 })), playoff: null, draft: null });
    expect(p.teams[2]!.pf).toBe(650);
  });
});

describe('chalkBracket and projectedDraft', () => {
  it('advances favorites with win chances', () => {
    const six = bracketFormat(6, 15, 0)!;
    const means: Record<number, number> = { 1: 140, 2: 130, 3: 120, 4: 110, 5: 100, 6: 90 };
    const weekly: Record<number, Record<number, TeamWeekOutlook>> = {};
    for (const w of [15, 16, 17]) weekly[w] = Object.fromEntries(Object.entries(means).map(([id, m]) => [Number(id), { mean: m, variance: 225 }]));
    const b = chalkBracket(six, [1, 2, 3, 4, 5, 6], weekly, new Map([1, 2, 3, 4, 5, 6].map((id) => [id, 1])));
    const [quarters, semis, final] = b.rounds;
    expect(quarters?.matches.map((m) => [m.top?.seed ?? null, m.bottom?.seed ?? null])).toEqual([[1, null], [4, 5], [2, null], [3, 6]]);
    expect(Math.abs((quarters?.matches[1]?.pTop ?? 0) - 0.68)).toBeLessThan(0.01);
    expect(semis?.matches.map((m) => [m.top?.seed, m.bottom?.seed])).toEqual([[1, 4], [2, 3]]);
    expect([final?.matches[0]?.top?.seed, final?.matches[0]?.bottom?.seed]).toEqual([1, 2]);
    expect(b.champion).toEqual({ seed: 1, rosterId: 1 });
  });

  it('orders the draft on projected wins and max points', () => {
    const picks = projectedDraft(run(), { method: 'linear' });
    expect(picks[0]?.rosterId).toBe(4);
    expect(picks[picks.length - 1]?.rosterId).toBe(1);
    expect(picks[0]?.odds?.[0]).toBeGreaterThan(0.99);
  });
});
