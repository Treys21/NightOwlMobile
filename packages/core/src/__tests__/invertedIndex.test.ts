import { describe, expect, it } from 'vitest';
import { buildInvertedRosterIndex, filterPortfolio } from '../engine/invertedIndex';
import type { SleeperLeagueUser } from '../types/sleeper';
import { league, matchup, player, roster } from './fixtures';

const ME = 'u-me';
const players = Object.fromEntries(
  [
    player('qb1', 'Josh Allen', 'QB', 'BUF'),
    player('rb1', 'James Cook', 'RB', 'BUF'),
    player('rb2', 'Bijan Robinson', 'RB', 'ATL'),
    player('wr1', "Ja'Marr Chase", 'WR', 'CIN'),
    player('wr2', 'Puka Nacua', 'WR', 'LAR'),
    player('te1', 'Trey McBride', 'TE', 'ARI'),
    player('wr3', 'Davante Adams', 'WR', 'LAR'),
    player('rb3', 'Kyren Williams', 'RB', 'LAR'),
    player('ir1', 'Injured Guy', 'WR', 'NYJ'),
    player('tx1', 'Taxi Rookie', 'RB', 'NYG'),
    player('opp_qb', 'Matthew Stafford', 'QB', 'LAR')
  ].map((p) => [p.player_id, p])
);

const users = (opp: string, team?: string): SleeperLeagueUser[] => [
  { user_id: ME, display_name: 'me', avatar: null, metadata: { team_name: 'Night Owls' } },
  { user_id: opp, display_name: opp, avatar: null, metadata: team ? { team_name: team } : {} }
];

// Starting slots: QB RB RB WR WR TE FLEX
const myStartersA = ['qb1', 'rb1', 'rb2', 'wr1', 'wr2', 'te1', 'wr3'];
const oppStartersA = ['opp_qb', 'rb3', '0', 'wr1x', '0', '0', 'rb1x'];

function twoLeagues() {
  const A = league('A', 'Main Dynasty');
  const B = league('B', 'Work League', { rec: 0.5, pass_td: 6 });
  const rostersByLeague = {
    A: [roster(1, ME, myStartersA, ['rb3x'], ['ir1'], ['tx1']), roster(2, 'u-mike', oppStartersA)],
    B: [roster(4, ME, ['opp_qb', 'rb3', '0', 'wr2', '0', '0', '0'], ['qb1']), roster(7, 'u-sam', ['qb1x', 'wr2x', '0', '0', '0', '0', 'wr2'])]
  };
  const matchupsByLeague = {
    A: [matchup(1, 3, myStartersA, 101.5, { wr2: 12.4 }), matchup(2, 3, oppStartersA, 88.25, { rb3: 9.1 })],
    // League B: the opponent starts Puka too (a multi-copy league), so he's on both sides.
    B: [matchup(4, 1, ['opp_qb', 'rb3', '0', 'wr2', '0', '0', '0'], 70), matchup(7, 1, ['qb1x', 'wr2x', '0', '0', '0', '0', 'wr2'], 80)]
  };
  return buildInvertedRosterIndex({
    userId: ME,
    leagues: [A, B],
    rostersByLeague,
    matchupsByLeague,
    usersByLeague: { A: users('u-mike', 'Mike Drop'), B: users('u-sam') },
    playersMap: players,
    leagueWeights: { A: 2 }
  });
}

describe('buildInvertedRosterIndex', () => {
  it('categorizes starters, bench, IR and taxi with their slots', () => {
    const { index } = twoLeagues();
    const allen = index.qb1;
    expect(allen?.startedInLeagues.map((c) => [c.leagueId, c.userAssignedSlot])).toEqual([['A', 'QB']]);
    expect(allen?.benchedInLeagues.map((c) => [c.leagueId, c.userAssignedSlot])).toEqual([['B', 'BN']]);
    expect(index.wr3?.startedInLeagues[0]?.userAssignedSlot).toBe('FLEX');
    expect(index.ir1?.irOrTaxiInLeagues[0]?.userSlotCategory).toBe('IR');
    expect(index.tx1?.irOrTaxiInLeagues[0]?.userSlotCategory).toBe('TAXI');
  });

  it('pairs the opponent by matchup_id and names them by team name first', () => {
    const { index, matchupSummaries } = twoLeagues();
    const kyren = index.rb3;
    expect(kyren?.facingInLeagues.map((c) => c.leagueId)).toEqual(['A']);
    expect(kyren?.facingInLeagues[0]?.opponentDisplayName).toBe('Mike Drop');
    expect(kyren?.facingInLeagues[0]?.playerPointsInLeagueThisWeek).toBe(9.1);
    const a = matchupSummaries.find((m) => m.leagueId === 'A');
    expect(a).toMatchObject({ userTeamName: 'Night Owls', opponentTeamName: 'Mike Drop', userPoints: 101.5, opponentPoints: 88.25, pointDifferential: 13.25, isWinning: true, isTied: false });
    expect(matchupSummaries.find((m) => m.leagueId === 'B')?.opponentTeamName).toBe('u-sam');
  });

  it('flags players started on both sides and computes leverage', () => {
    const { index } = twoLeagues();
    const puka = index.wr2;
    expect(puka?.startedInLeagues.map((c) => c.leagueId).sort()).toEqual(['A', 'B']);
    expect(puka?.facingInLeagues.map((c) => c.leagueId)).toEqual(['B']);
    expect(puka?.startedInLeagues.find((c) => c.leagueId === 'B')?.isOpponentStarter).toBe(true);
    expect(puka?.isHighConflictPlayer).toBe(true);
    expect(puka?.netLeverageCount).toBe(1);
    // A is weighted 2.0: 2 + 1 started − 1 facing.
    expect(puka?.weightedLeverageScore).toBe(2);
    expect(puka?.ownershipShare).toBe(1);
  });

  it('ignores empty "0" slots and leagues the user is not in', () => {
    const { index } = twoLeagues();
    expect(index['0']).toBeUndefined();
    const solo = buildInvertedRosterIndex({
      userId: 'nobody',
      leagues: [league('A', 'A')],
      rostersByLeague: { A: [roster(1, ME, ['qb1'])] },
      matchupsByLeague: {},
      usersByLeague: {},
      playersMap: players
    });
    expect(solo.index).toEqual({});
    expect(solo.matchupSummaries).toEqual([]);
  });

  it('gives no opponent on a bye week (null matchup_id)', () => {
    const { index, matchupSummaries } = buildInvertedRosterIndex({
      userId: ME,
      leagues: [league('A', 'A')],
      rostersByLeague: { A: [roster(1, ME, myStartersA), roster(2, 'u-mike', oppStartersA)] },
      matchupsByLeague: { A: [matchup(1, null, myStartersA, 0), matchup(2, null, oppStartersA, 0)] },
      usersByLeague: { A: users('u-mike') },
      playersMap: players
    });
    expect(index.rb3).toBeUndefined();
    expect(matchupSummaries[0]).toMatchObject({ opponentRosterId: null, opponentTeamName: 'Bye', isWinning: false });
  });

  it('honors co-owners', () => {
    const r = roster(1, 'someone-else', ['qb1']);
    r.co_owners = [ME];
    const { index } = buildInvertedRosterIndex({
      userId: ME,
      leagues: [league('A', 'A')],
      rostersByLeague: { A: [r] },
      matchupsByLeague: {},
      usersByLeague: {},
      playersMap: players
    });
    expect(index.qb1?.startedInLeagues).toHaveLength(1);
  });

  it('filters the portfolio by position, conflicts and search', () => {
    const { index } = twoLeagues();
    expect(filterPortfolio(index, 'CONFLICTS', '').map((e) => e.playerId)).toEqual(['wr2', 'rb3', 'opp_qb']);
    expect(filterPortfolio(index, 'QB', '').map((e) => e.playerId).sort()).toEqual(['opp_qb', 'qb1']);
    expect(filterPortfolio(index, 'ALL', 'nacua').map((e) => e.playerId)).toEqual(['wr2']);
  });
});
