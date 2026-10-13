import { describe, expect, it } from 'vitest';
import { PlayDiffer, enrichPlay, filterFeed, subtractDeltas } from '../engine/playDiffer';
import { buildInvertedRosterIndex } from '../engine/invertedIndex';
import type { ParsedPlay, RawPlayStatDelta } from '../types/play-feed';
import { PPR, league, matchup, player, roster } from './fixtures';

const base = (id: string, seq: number, deltas: RawPlayStatDelta[], extra: Partial<ParsedPlay> = {}): ParsedPlay => ({
  playId: id,
  gameId: 'g1',
  sequenceNumber: seq,
  timestamp: seq,
  awayTeam: 'BUF',
  homeTeam: 'LAR',
  awayScore: 0,
  homeScore: 0,
  quarter: 1,
  clock: '10:00',
  downAndDistance: '1st & 10 at BUF 25',
  isScoringPlay: false,
  isRedZonePlay: false,
  description: `play ${id}`,
  statDeltas: deltas,
  ...extra
});

const run = (yds: number): RawPlayStatDelta[] => [{ playerId: 'cook', rushAtt: 1, rushYds: yds }];
const catchBy = (yds: number): RawPlayStatDelta[] => [
  { playerId: 'allen', passAtt: 1, passCmp: 1, passYds: yds },
  { playerId: 'knox', rec: 1, recYds: yds }
];

describe('PlayDiffer', () => {
  it('treats the first look at a game as a baseline, then emits only new plays', () => {
    const d = new PlayDiffer();
    const first = d.ingest('g1', [base('1', 1, run(4)), base('2', 2, run(6))]);
    expect(first.baseline).toBe(true);
    expect(first.plays.map((p) => p.play.playId)).toEqual(['1', '2']);
    const again = d.ingest('g1', [base('1', 1, run(4)), base('2', 2, run(6))]);
    expect(again.baseline).toBe(false);
    expect(again.plays).toEqual([]);
    const next = d.ingest('g1', [base('1', 1, run(4)), base('2', 2, run(6)), base('3', 3, run(10))]);
    expect(next.plays.map((p) => p.play.playId)).toEqual(['3']);
    expect(next.plays[0]?.deltas[0]?.prevCumulative.rushYds).toBe(10);
    expect(next.plays[0]?.deltas[0]?.nextCumulative.rushYds).toBe(20);
  });

  it('emits only the difference when a play is corrected', () => {
    const d = new PlayDiffer();
    d.ingest('g1', [base('1', 1, catchBy(12))]);
    const fixed = d.ingest('g1', [base('1', 1, catchBy(9))]);
    expect(fixed.plays).toHaveLength(1);
    expect(fixed.plays[0]?.isCorrection).toBe(true);
    expect(fixed.plays[0]?.play.statDeltas).toEqual([
      { playerId: 'allen', passYds: -3 },
      { playerId: 'knox', recYds: -3 }
    ]);
    expect(d.cumulative('g1', 'knox').recYds).toBe(9);
  });

  it('negates a play that vanishes (reversed on review)', () => {
    const d = new PlayDiffer();
    d.ingest('g1', [base('1', 1, catchBy(20)), base('2', 2, run(3))]);
    const out = d.ingest('g1', [base('2', 2, run(3))]);
    expect(out.plays[0]?.isCorrection).toBe(true);
    expect(out.plays[0]?.play.description).toBe('Reversed: play 1');
    expect(out.plays[0]?.play.statDeltas.find((x) => x.playerId === 'knox')).toEqual({ playerId: 'knox', rec: -1, recYds: -20 });
  });

  it('forgets games no longer on the slate', () => {
    const d = new PlayDiffer();
    d.ingest('g1', [base('1', 1, run(4))]);
    d.retain(['g2']);
    expect(d.ingest('g1', [base('1', 1, run(4))]).baseline).toBe(true);
  });

  it('subtracts deltas per player', () => {
    expect(subtractDeltas(run(7), run(4))).toEqual([{ playerId: 'cook', rushYds: 3 }]);
    expect(subtractDeltas(run(4), run(4))).toEqual([]);
  });
});

describe('enrichPlay', () => {
  const players = {
    allen: player('allen', 'Josh Allen', 'QB', 'BUF'),
    cook: player('cook', 'James Cook', 'RB', 'BUF'),
    knox: player('knox', 'Dawson Knox', 'TE', 'BUF')
  };
  // League A: I start Knox, my opponent starts Allen. League B: I start Allen and Knox sits.
  const { index } = buildInvertedRosterIndex({
    userId: 'me',
    leagues: [league('A', 'Main', PPR), league('B', 'Work', { ...PPR, rec: 0.5, bonus_rec_te: 1, pass_td: 6 })],
    rostersByLeague: {
      A: [roster(1, 'me', ['0', '0', '0', '0', '0', 'knox', '0']), roster(2, 'opp', ['allen', '0', '0', '0', '0', '0', '0'])],
      B: [roster(1, 'me', ['allen', '0', '0', '0', '0', '0', '0'], ['knox']), roster(2, 'opp', ['0', '0', '0', '0', '0', '0', '0'])]
    },
    matchupsByLeague: {
      A: [matchup(1, 1, ['0', '0', '0', '0', '0', 'knox', '0']), matchup(2, 1, ['allen', '0', '0', '0', '0', '0', '0'])],
      B: [matchup(1, 1, ['allen', '0', '0', '0', '0', '0', '0']), matchup(2, 1, ['0', '0', '0', '0', '0', '0', '0'])]
    },
    usersByLeague: { A: [{ user_id: 'opp', display_name: 'Mike', avatar: null }], B: [] },
    playersMap: players,
    leagueWeights: { B: 2 }
  });

  it('scores each league by its own rules and nets for vs. against', () => {
    const d = new PlayDiffer();
    const td = base('9', 9, [
      { playerId: 'allen', passAtt: 1, passCmp: 1, passYds: 25, passTd: 1 },
      { playerId: 'knox', rec: 1, recYds: 25, recTd: 1 }
    ], { isScoringPlay: true });
    const [diffed] = d.ingest('g1', [td]).plays;
    const event = enrichPlay(diffed!, index, (id) => players[id as keyof typeof players] ?? null);
    const by = (pid: string, lg: string) => event.leagueImpacts.find((i) => i.playerId === pid && i.leagueId === lg);
    expect(by('knox', 'A')).toMatchObject({ perspective: 'FOR_USER', pointsDelta: 9.5, netLeagueDelta: 9.5 });
    expect(by('allen', 'A')).toMatchObject({ perspective: 'AGAINST_USER', pointsDelta: 5, netLeagueDelta: -5, opponentName: 'Mike' });
    expect(by('allen', 'B')).toMatchObject({ perspective: 'FOR_USER', pointsDelta: 7 });
    // Knox on my bench in B: 0.5 + 1 TEP + 2.5 yds + 6 TD = 10, nets zero.
    expect(by('knox', 'B')).toMatchObject({ perspective: 'USER_BENCH', pointsDelta: 10, netLeagueDelta: 0 });
    expect(event.totalNetPointsForUser).toBe(11.5);
    // B weighs double: 9.5 − 5 + 7 × 2
    expect(event.weightedNetPointsForUser).toBe(18.5);
    expect(event.involvedPlayerIds.sort()).toEqual(['allen', 'knox']);

    expect(filterFeed([event], 'MY_STARTERS')).toHaveLength(1);
    expect(filterFeed([event], 'OPPONENTS')).toHaveLength(1);
    expect(filterFeed([event], 'BIG_PLAYS')).toHaveLength(1);
    expect(filterFeed([event], 'ALL_ACTION', 'B')).toHaveLength(1);
    expect(filterFeed([event], 'ALL_ACTION', 'Z')).toHaveLength(0);
  });

  it('labels corrections with a distinct id', () => {
    const d = new PlayDiffer();
    d.ingest('g1', [base('1', 1, catchBy(12))]);
    const [fix] = d.ingest('g1', [base('1', 1, catchBy(2))]).plays;
    const event = enrichPlay(fix!, index, () => null);
    expect(event.isStatCorrectionOrReversal).toBe(true);
    expect(event.playId).not.toBe('1');
    expect(event.totalNetPointsForUser).toBe(-1);
  });
});
