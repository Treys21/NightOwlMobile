import { describe, expect, it } from 'vitest';
import type { EnrichedPlayEvent, LiveMatchupSummary } from '@nightowl/core';
import { buildContent, deltaText, headline } from '../utils/liveActivityContent';

const summary = (leagueName: string, me: number, opp: number, bye = false): LiveMatchupSummary => ({
  leagueId: leagueName,
  leagueName,
  leagueAvatar: null,
  userRosterId: 1,
  userTeamName: 'Me',
  userPoints: me,
  opponentRosterId: bye ? null : 2,
  opponentTeamName: bye ? 'Bye' : 'Them',
  opponentPoints: opp,
  pointDifferential: Math.round((me - opp) * 100) / 100,
  isWinning: !bye && me > opp,
  isTied: !bye && me === opp
});

const play = (ts: number, net: number, description: string, playerName = 'Puka Nacua'): EnrichedPlayEvent => ({
  playId: String(ts), gameId: 'g', sequenceNumber: ts, timestamp: ts, awayTeam: 'BUF', homeTeam: 'LAR', awayScore: 0, homeScore: 0,
  quarter: 1, clock: '', downAndDistance: '', isScoringPlay: false, isRedZonePlay: false, isStatCorrectionOrReversal: false,
  description, involvedPlayerIds: ['p'], statDeltas: [],
  leagueImpacts: [{ leagueId: 'A', leagueName: 'A', playerId: 'p', playerName, pointsDelta: net, perspective: 'FOR_USER', netLeagueDelta: net, opponentName: null }],
  totalNetPointsForUser: net, weightedNetPointsForUser: net
});

describe('Live Activity content', () => {
  const now = new Date(2026, 9, 18, 15, 0).getTime();

  it('counts leads, nets today, and lists the two closest matchups', () => {
    const content = buildContent(
      [summary('Main', 101.5, 98.2), summary('Work', 80, 120), summary('Bye League', 50, 0, true), summary('Close', 90, 90.4)],
      [play(now - 1000, 7.4, '(Shotgun) M.Stafford pass short left to P.Nacua for 12 yards'), play(now - 2000, -3, 'x'), play(now - 2 * 86400000, 20, 'old')],
      now
    );
    expect(content.winningLeaguesCount).toBe(1);
    expect(content.totalActiveLeagues).toBe(4);
    expect(content.netPortfolioPointsToday).toBe(4.4);
    expect(content.latestPlayDeltaText).toBe('+7.4 pts');
    expect(content.isPositivePlay).toBe(true);
    expect(content.closestMatchups).toEqual(['Close 90.0–90.4', 'Main 101.5–98.2']);
    expect(content.latestPlayHeadline).toBe('M.Stafford pass short left to P.Nacua for 12 yards');
    expect(content.updatedAtEpoch).toBe(Math.floor(now / 1000));
  });

  it('has sensible text with no plays', () => {
    expect(headline(undefined)).toBe('Waiting for the first play');
    expect(deltaText(-6.94)).toBe('-6.9 pts');
    expect(buildContent([], [], 0).latestPlayDeltaText).toBe('+0.0 pts');
  });

  it('names the player when the play text does not', () => {
    expect(headline(play(1, 1, 'FG 40-49', 'Kick Er'))).toBe('Kick Er: FG 40-49');
  });
});
