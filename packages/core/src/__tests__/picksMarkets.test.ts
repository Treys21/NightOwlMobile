import { describe, expect, it } from 'vitest';
import {
  hitRate,
  impliedOver,
  keyMarket,
  liveLine,
  marketProgress,
  mergePicksLines,
  ordinal,
  parseMilestones,
  parsePicksLines,
  trimRungs
} from '../engine/picksMarkets';
import { describeStatDelta, diffStatSnapshots, humanizeStatKey, trimSnapshot } from '../engine/statTracker';
import { buildInvertedRosterIndex } from '../engine/invertedIndex';
import { PPR, league, matchup, player, roster } from './fixtures';
import type { SleeperPicksEntry } from '../types/sleeper';

const entry = (pid: string, type: string, line: number, over: string, under: string, updated = 1): SleeperPicksEntry => ({
  subject_id: pid,
  subject_type: 'player',
  wager_type: type,
  game_id: 'g',
  updated_at: updated,
  options: [
    { sport: 'nfl', outcome: 'over', outcome_value: String(line), payout_multiplier: over },
    { sport: 'nfl', outcome: 'under', outcome_value: String(line), payout_multiplier: under }
  ],
  recent_performance: { values: [{ value: 80 }, { value: 50 }, { value: 101 }, { value: null }] }
});

describe('Sleeper Picks', () => {
  it('parses NFL player markets, newest per type, in display order', () => {
    const lines = parsePicksLines([
      entry('1', 'receptions', 5.5, '1.8', '2.0'),
      entry('1', 'receiving_yards', 70.5, '1.9', '1.9', 1),
      entry('1', 'receiving_yards', 72.5, '1.85', '1.95', 9),
      { ...entry('2', 'receptions', 3.5, '1.9', '1.9'), options: [{ sport: 'nba', outcome: 'over', outcome_value: '3.5', payout_multiplier: '1.9' }] },
      entry('3', 'unknown_market', 1, '2', '2')
    ]);
    expect(Object.keys(lines)).toEqual(['1']);
    expect(lines['1']?.map((m) => [m.type, m.line])).toEqual([['receiving_yards', 72.5], ['receptions', 5.5]]);
    expect(lines['1']?.[1]?.pOver).toBeCloseTo((1 / 1.8) / (1 / 1.8 + 1 / 2), 10);
  });

  it('keeps closing lines after they vanish', () => {
    const before = parsePicksLines([entry('1', 'receptions', 5.5, '1.8', '2.0')]);
    const after = mergePicksLines(before, parsePicksLines([entry('1', 'receiving_yards', 70.5, '1.9', '1.9')]));
    expect(after['1']?.map((m) => m.type)).toEqual(['receiving_yards', 'receptions']);
  });

  it('computes hit rate, progress and the key market', () => {
    const [yds] = parsePicksLines([entry('1', 'receiving_yards', 70.5, '1.9', '1.9')])['1'] ?? [];
    expect(hitRate(yds!.recent, 70.5)).toEqual({ over: 2, games: 3 });
    expect(marketProgress(yds!, { rec_yd: 35 })).toMatchObject({ value: 35, pct: 35 / 70.5, hit: false });
    expect(marketProgress(yds!, {})).toMatchObject({ value: 0 });
    expect(keyMarket([yds!], 'WR')?.type).toBe('receiving_yards');
    expect(impliedOver(2, null)).toBe(0.5);
    expect(impliedOver(null, null)).toBeNull();
  });

  it('reads DraftKings milestone ladders by ESPN athlete and trims them', () => {
    const ladders = parseMilestones([
      { athlete: { $ref: 'http://x/athletes/123?lang=en' }, type: { name: 'Receiving Yards Milestones' }, current: { target: { value: 50 } } },
      { athlete: { $ref: 'http://x/athletes/123?lang=en' }, type: { name: 'Receiving Yards Milestones' }, current: { target: { value: 25 } } },
      { athlete: { $ref: 'http://x/athletes/123?lang=en' }, type: { name: 'Anytime Touchdown Scorer' }, current: {} }
    ]);
    expect(ladders['123']).toEqual([{ label: 'Rec yds', keys: ['rec_yd'], rungs: [25, 50] }]);
    expect(trimRungs([10, 20, 30, 40, 50, 60, 70, 80], 45, 4)).toEqual([30, 40, 50, 60]);
  });

  it('formats live lines and ordinals', () => {
    expect(liveLine('WR', { rec: 4, rec_yd: 38 })).toBe('4 rec · 38 yds so far');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(13)).toBe('13th');
  });
});

describe('statTracker (ported)', () => {
  it('describes deltas and bonus keys', () => {
    expect(describeStatDelta({ rec: 1, rec_yd: 15, rec_td: 1, bonus_rec_td_40p: 1 }, [{ ...PPR, bonus_rec_td_40p: 2 }])).toBe('+1 rec · +15 rec yds · +1 rec TD · 40+ rec td bonus');
    expect(humanizeStatKey('rec_td_40p')).toBe('40+ yd rec TD');
    expect(humanizeStatKey('bonus_rec_yd_100')).toBe('100+ rec yds bonus');
  });

  it('emits one event per watched player whose points moved, with per-league impact', () => {
    const { index } = buildInvertedRosterIndex({
      userId: 'me',
      leagues: [league('A', 'Main')],
      rostersByLeague: { A: [roster(1, 'me', ['0', '0', '0', '0', '0', '0', 'k1']), roster(2, 'o', ['0', '0', '0', '0', '0', '0', 'def'])] },
      matchupsByLeague: { A: [matchup(1, 1, ['0', '0', '0', '0', '0', '0', 'k1']), matchup(2, 1, ['0', '0', '0', '0', '0', '0', 'def'])] },
      usersByLeague: {},
      playersMap: { k1: player('k1', 'Kick Er', 'K', 'BUF') }
    });
    const scoringIndex = Object.fromEntries(Object.entries(index).map(([k, e]) => [k, {
      ...e,
      startedInLeagues: e.startedInLeagues.map((c) => ({ ...c, scoringSettings: { fgm_40_49: 4, sack: 1 } })),
      facingInLeagues: e.facingInLeagues.map((c) => ({ ...c, scoringSettings: { fgm_40_49: 4, sack: 1 } }))
    }]));
    const prev = trimSnapshot({}, scoringIndex);
    expect(prev).toEqual({ k1: {}, def: {} });
    const events = diffStatSnapshots(prev, { k1: { fgm_40_49: 1, fgm: 1 }, def: { sack: 2 } }, scoringIndex, 5);
    expect(events.map((e) => [e.playerId, e.net])).toEqual([['k1', 4], ['def', -2]]);
    expect(events[0]?.text).toBe('+1 FG 40-49');
  });
});
