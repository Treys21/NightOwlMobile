import { describe, expect, it } from 'vitest';
import {
  americanToRawProb,
  computeImpliedFantasyPoints,
  decimalToAmerican,
  devigTwoWay,
  emptyProp,
  expectedTouchdownsFromAnytimeOdds,
  gameEnvironmentFromGame,
  mergePicksIntoProp
} from '../engine/vegasCalculator';
import type { NflGame } from '../types/espn';
import type { PicksMarket } from '../types/vegas';
import { HALF, PPR, player } from './fixtures';

describe('odds conversion', () => {
  it('turns American odds into raw implied probability', () => {
    expect(americanToRawProb(-150)).toBeCloseTo(0.6, 10);
    expect(americanToRawProb(120)).toBeCloseTo(100 / 220, 10);
    expect(americanToRawProb(100)).toBe(0.5);
    expect(americanToRawProb(0)).toBe(0);
  });

  it('turns decimal payouts into American odds', () => {
    expect(decimalToAmerican(2.34)).toBe(134);
    expect(decimalToAmerican(1.41)).toBe(-244);
    expect(decimalToAmerican(1)).toBeNull();
  });
});

describe('devigTwoWay', () => {
  it('removes the book hold multiplicatively', () => {
    // +120 / -150: raw 0.4545 + 0.6 = 1.0545 → fair over 0.431
    expect(devigTwoWay(120, -150)).toBeCloseTo(0.4310, 4);
    expect(devigTwoWay(-110, -110)).toBeCloseTo(0.5, 10);
  });
});

describe('expectedTouchdownsFromAnytimeOdds', () => {
  it('strips ~6% hold and takes the Poisson rate', () => {
    // +150 → 0.4 raw → 0.376 fair → λ = −ln(0.624) = 0.472
    expect(expectedTouchdownsFromAnytimeOdds(150)).toBe(0.472);
    expect(expectedTouchdownsFromAnytimeOdds(null)).toBe(0);
  });

  it('caps the fair probability at 88%', () => {
    expect(expectedTouchdownsFromAnytimeOdds(-10000)).toBe(Math.round(-Math.log(0.12) * 1000) / 1000);
  });
});

describe('computeImpliedFantasyPoints', () => {
  const wr = player('wr', 'Puka Nacua', 'WR', 'LAR');
  const te = player('te', 'Trey McBride', 'TE', 'ARI');
  const qb = player('qb', 'Josh Allen', 'QB', 'BUF');

  it('projects a receiver from receptions, yards and anytime TD', () => {
    const prop = { ...emptyProp('wr', 'g', 'LAR', 'BUF'), recLine: 6.5, recOverOdds: -120, recUnderOdds: 100, recYdsLine: 78.5, anytimeTdAmericanOdds: 140 };
    const pOver = devigTwoWay(-120, 100);
    const recs = 6 + pOver;
    const tds = expectedTouchdownsFromAnytimeOdds(140);
    const expected = Math.round((recs * 1 + 78.5 * 0.1 + tds * 6) * 100) / 100;
    const ppr = computeImpliedFantasyPoints(prop, wr, PPR, 'L1');
    expect(ppr.impliedFantasyPoints).toBe(expected);
    expect(ppr.leagueId).toBe('L1');
    expect(computeImpliedFantasyPoints(prop, wr, HALF).impliedFantasyPoints).toBeCloseTo(expected - recs * 0.5, 1);
  });

  it('adds TE premium to the reception rate', () => {
    const prop = { ...emptyProp('te', 'g', 'ARI', 'SEA'), recLine: 5.5, recYdsLine: 55.5 };
    const base = computeImpliedFantasyPoints(prop, te, PPR).impliedFantasyPoints;
    const tep = computeImpliedFantasyPoints(prop, te, { ...PPR, bonus_rec_te: 0.5 }).impliedFantasyPoints;
    expect(tep - base).toBeCloseTo(5.5 * 0.5, 5);
  });

  it('projects a quarterback with de-vigged pass TDs and INTs', () => {
    const prop = {
      ...emptyProp('qb', 'g', 'BUF', 'LAR'),
      passYdsLine: 252.5,
      passTdLine: 1.5,
      passTdOverOdds: 120,
      passTdUnderOdds: -150,
      passIntLine: 0.5,
      passIntOverOdds: 110,
      passIntUnderOdds: -140,
      rushYdsLine: 33.5
    };
    const tds = 1 + devigTwoWay(120, -150) * 1.15;
    const ints = devigTwoWay(110, -140);
    const p = computeImpliedFantasyPoints(prop, qb, PPR);
    expect(p.breakdown.passingPoints).toBe(Math.round((252.5 * 0.04 + tds * 4 - ints) * 100) / 100);
    expect(p.breakdown.rushingPoints).toBe(3.35);
    expect(p.breakdown.touchdownPoints).toBe(0);
  });
});

describe('game environment', () => {
  const game: NflGame = {
    id: '1', kickoff: Date.parse('2026-10-18T13:30:00Z'), away: 'HOU', home: 'JAX', awayScore: 0, homeScore: 0,
    state: 'pre', started: false, remaining: 1, quarter: 0, clock: '', isDome: false,
    odds: { details: 'JAX -3', overUnder: 42.5 }, isRedZone: false
  };

  it('splits the total by the spread', () => {
    expect(gameEnvironmentFromGame(game)).toMatchObject({ homeSpread: -3, overUnderTotal: 42.5, homeImpliedTotal: 22.75, awayImpliedTotal: 19.75 });
  });

  it('handles an away favorite, a pick-em and no line', () => {
    expect(gameEnvironmentFromGame({ ...game, odds: { details: 'HOU -7.5', overUnder: 44 } })).toMatchObject({ homeSpread: 7.5, awayImpliedTotal: 25.75, homeImpliedTotal: 18.25 });
    expect(gameEnvironmentFromGame({ ...game, odds: { details: 'EVEN', overUnder: 40 } })).toMatchObject({ homeSpread: 0, homeImpliedTotal: 20 });
    expect(gameEnvironmentFromGame({ ...game, odds: null })).toBeNull();
  });
});

describe('mergePicksIntoProp', () => {
  const market = (type: string, line: number, over: number | null, under: number | null, pOver: number | null = null): PicksMarket => ({
    type, label: type, keys: [], td: type === 'anytime_touchdowns', max: false, line, over, under, pOver, recent: [], gameId: null, updatedAt: 5
  });

  it('fills missing lines and prices from Sleeper Picks payouts', () => {
    const merged = mergePicksIntoProp({ ...emptyProp('wr', 'g', 'LAR', 'BUF'), recYdsLine: 80.5 }, [
      market('receptions', 6.5, 1.8, 2.0),
      market('receiving_yards', 75.5, 1.9, 1.9),
      market('anytime_touchdowns', 0.5, 2.5, 1.5, 0.375)
    ]);
    expect(merged.recLine).toBe(6.5);
    expect(merged.recOverOdds).toBe(-125);
    expect(merged.recUnderOdds).toBe(100);
    expect(merged.recYdsLine).toBe(80.5);
    expect(merged.anytimeTdFairProbability).toBe(0.375);
    expect(merged.updatedAtMs).toBe(5);
  });
});
