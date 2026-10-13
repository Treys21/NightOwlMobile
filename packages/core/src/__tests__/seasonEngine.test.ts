// Ported from the Chrome extension's season tests: the same fixtures must give
// the same answers in TypeScript.
import { describe, expect, it } from 'vitest';
import {
  allPlay,
  asItStands,
  draftOrder,
  phi,
  pickOwners,
  playoffOdds,
  powerRatings,
  standings,
  teamStrength,
  weeksRecorded,
  winProbability,
  outlook
} from '../engine/seasonEngine';
import { remainingShare } from '../engine/espnParsers';
import { matchup, roster } from './fixtures';

describe('all-play', () => {
  it('counts every team every week; ties are half a win', () => {
    const ap = allPlay([{ 1: 100, 2: 90, 3: 80, 4: 70 }, { 1: 60, 2: 90, 3: 90, 4: 50 }]);
    expect(ap['1']).toEqual({ w: 4, l: 2, t: 0, expected: 1.33 });
    expect(ap['2']).toEqual({ w: 4, l: 1, t: 1, expected: 1.5 });
    expect(ap['4']).toEqual({ w: 0, l: 6, t: 0, expected: 0 });
  });

  it('adds median-game wins for the top half', () => {
    const ap = allPlay([{ 1: 100, 2: 90, 3: 80, 4: 70 }, { 1: 100, 2: 60, 3: 90, 4: 50 }], { medianGame: true });
    expect(ap['1']?.expected).toBe(4);
    expect(ap['2']?.expected).toBe(Math.round((2 / 3 + 1 + 1 / 3 + 0) * 100) / 100);
  });
});

describe('standings and luck', () => {
  it('ranks by wins then points and measures luck against all-play', () => {
    const r1 = roster(1, 'a', []);
    r1.settings = { wins: 2, losses: 0, ties: 0, fpts: 160, fpts_decimal: 50, ppts: 200 };
    const r2 = roster(2, 'b', []);
    r2.settings = { wins: 0, losses: 2, ties: 0, fpts: 180, ppts: 190 };
    const rows = standings([r2, r1], [{ 1: 70, 2: 100 }, { 1: 90.5, 2: 80 }]);
    expect(rows.map((r) => r.rosterId)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ rank: 1, pf: 160.5, max: 200, luck: 1 });
    expect(rows[1]?.luck).toBe(-1);
  });
});

describe('win probability', () => {
  it('uses a normal model around the projections left', () => {
    const me = outlook([{ points: 60, proj: 20, remaining: 0.5 }]);
    const opp = outlook([{ points: 45, proj: 20, remaining: 0.5 }]);
    const p = winProbability(me, opp);
    expect(p > 0.9 && p < 1).toBe(true);
    expect(Math.abs(phi(1.96) - 0.975)).toBeLessThan(1e-4);
    expect(winProbability({ mean: 10, variance: 0 }, { mean: 10, variance: 0 })).toBe(0.5);
  });

  it('reads the share of a game left from ESPN status', () => {
    expect(remainingShare({ type: { state: 'pre' } })).toBe(1);
    expect(remainingShare({ type: { state: 'post' } })).toBe(0);
    expect(remainingShare({ type: { state: 'in' }, period: 3, clock: 450 })).toBe((900 + 450) / 3600);
    expect(remainingShare({ type: { state: 'in' }, period: 5, clock: 300 })).toBe(0.02);
  });
});

describe('playoff odds', () => {
  it('pulls a short track record toward the league average', () => {
    const strong = teamStrength([{ 1: 150, 2: 100, 3: 100, 4: 50 }], 1);
    expect(strong.mean > 100 && strong.mean < 150).toBe(true);
    expect(strong.sd).toBeGreaterThan(0);
  });

  it('finds clinched, eliminated and coin-flip teams, deterministically', () => {
    const team = (rosterId: number, wins: number) => ({ rosterId, wins, ties: 0, pf: 500, mean: 100, sd: 15 });
    const teams = [team(1, 9), team(2, 6), team(3, 6), team(4, 3)];
    const odds = playoffOdds({ teams, schedule: [[[1, 4], [2, 3]]], playoffTeams: 2, sims: 4000, seed: 7 });
    expect(odds[1]).toBe(1);
    expect(odds[4]).toBe(0);
    expect(Math.abs((odds[2] ?? 0) - 0.5)).toBeLessThan(0.05);
    expect(Math.abs((odds[2] ?? 0) + (odds[3] ?? 0) - 1)).toBeLessThan(1e-9);
    expect(playoffOdds({ teams, schedule: [[[1, 4], [2, 3]]], playoffTeams: 2, sims: 4000, seed: 7 })).toEqual(odds);
  });

  it('counts the median game', () => {
    const teams = [1, 2, 3, 4].map((id) => ({ rosterId: id, wins: id === 4 ? 2 : 0, ties: 0, pf: 0, mean: id === 4 ? 200 : 80, sd: 1 }));
    expect(playoffOdds({ teams, schedule: [[[1, 2], [3, 4]]], playoffTeams: 1, medianGame: true, sims: 200 })[4]).toBe(1);
  });
});

// A finished 10-team season with a median game (28 games over 14 weeks).
const LEAGUE = (
  [
    ['Drakeo', 23, 2627.2], ['Horton', 18, 2624.28], ['Njigbas', 17, 2505.78], ['Griddy', 16, 2424.04],
    ['Troy', 16, 2436.76], ['Deebo', 16, 2440.68], ['Buttqin', 14, 2284.06], ['FutureHOF', 12, 2316.72],
    ['Herb', 8, 2142.74], ['Jeanty', 0, 1616.12]
  ] as const
).map(([name, wins, max], i) => ({ rosterId: i + 1, name, wins, max }));
const nameOf = (id: number) => LEAGUE.find((t) => t.rosterId === id)?.name;
const score = (picks: ReturnType<typeof draftOrder>, name: string) =>
  Math.round((picks.find((t) => nameOf(t.rosterId) === name)?.score ?? NaN) * 1e4) / 1e4;

describe('draft order', () => {
  it('linear: 30% wins + 70% max points, worst first', () => {
    const picks = draftOrder(LEAGUE, { method: 'linear' });
    expect(picks.map((t) => nameOf(t.rosterId))).toEqual(['Jeanty', 'Herb', 'FutureHOF', 'Buttqin', 'Griddy', 'Troy', 'Deebo', 'Njigbas', 'Horton', 'Drakeo']);
    expect(score(picks, 'Jeanty')).toBe(1);
    expect(score(picks, 'Herb')).toBe(0.5311);
    expect(score(picks, 'FutureHOF')).toBe(0.3584);
    expect(score(picks, 'Buttqin')).toBe(0.355);
    expect(score(picks, 'Horton')).toBe(0.0672);
    expect(score(picks, 'Drakeo')).toBe(0);
    expect(picks.map((t) => t.pick)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('inverse: the bottom pulls away, and 3 and 4 swap', () => {
    const picks = draftOrder(LEAGUE, { method: 'inverse' });
    expect(picks.map((t) => nameOf(t.rosterId))).toEqual(['Jeanty', 'Herb', 'Buttqin', 'FutureHOF', 'Griddy', 'Troy', 'Deebo', 'Njigbas', 'Horton', 'Drakeo']);
    expect(score(picks, 'Herb')).toBe(0.2747);
    expect(score(picks, 'Buttqin')).toBe(0.1759);
    expect(score(picks, 'FutureHOF')).toBe(0.161);
    expect(score(picks, 'Griddy')).toBe(0.0991);
    expect(score(picks, 'Horton')).toBe(0.0047);
  });

  it('has no NaN before any games and falls back to roster order', () => {
    const picks = draftOrder([1, 2, 3].map((rosterId) => ({ rosterId, wins: 0, max: 0 })), { method: 'inverse' });
    expect(picks.map((t) => t.rosterId)).toEqual([1, 2, 3]);
    expect(picks.every((t) => Number.isFinite(t.score))).toBe(true);
  });

  it('follows traded picks', () => {
    const owner = pickOwners([{ season: '2027', round: 1, roster_id: 3, owner_id: 7, previous_owner_id: 3 }], '2027');
    expect(owner(1, 3)).toBe(7);
    expect(owner(2, 3)).toBe(3);
  });
});

describe('live week and records', () => {
  it('folds a live week in as if it ended now', () => {
    const a = roster(1, 'a', []);
    a.settings = { wins: 3, losses: 1, ties: 0, fpts: 400, ppts: 450 };
    const b = roster(2, 'b', []);
    b.settings = { wins: 1, losses: 3, ties: 0, fpts: 380, ppts: 430 };
    const out = asItStands([a, b], [matchup(1, 1, [], 88), matchup(2, 1, [], 91.5)], () => null);
    expect(out[0]?.settings).toMatchObject({ wins: 3, losses: 2, fpts: 488, ppts: 450 });
    expect(out[1]?.settings).toMatchObject({ wins: 2, losses: 3, fpts: 471.5, fpts_against: 88 });
    expect(weeksRecorded(out)).toBe(5);
    expect(weeksRecorded(out, { medianGame: true })).toBe(2);
  });

  it('rates power from record, scoring, consistency and form', () => {
    const rows = [
      { rosterId: 1, wins: 3, losses: 0, ties: 0 },
      { rosterId: 2, wins: 0, losses: 3, ties: 0 }
    ];
    const ratings = powerRatings(rows, [{ 1: 120, 2: 90 }, { 1: 125, 2: 80 }, { 1: 130, 2: 100 }]);
    expect(ratings[1]).toBeGreaterThan(ratings[2] ?? 100);
    expect(ratings[1]).toBe(78.8);
  });
});
