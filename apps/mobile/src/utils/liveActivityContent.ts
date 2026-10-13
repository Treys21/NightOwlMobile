// What the Lock Screen and Dynamic Island show, built from the store. Pure,
// so it is unit-tested without the native module.
import { round2 } from '@nightowl/core';
import type { EnrichedPlayEvent, LiveMatchupSummary } from '@nightowl/core';

/** Mirrors NightOwlAttributes.ContentState in Swift. */
export interface LiveActivityContent {
  winningLeaguesCount: number;
  totalActiveLeagues: number;
  netPortfolioPointsToday: number;
  latestPlayHeadline: string;
  latestPlayDeltaText: string;
  isPositivePlay: boolean;
  updatedAtEpoch: number;
  /** "Main Dynasty 101.5–98.2" for the two closest matchups. */
  closestMatchups: string[];
}

const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

/** "+7.4 pts" / "−6.9 pts" */
export const deltaText = (n: number): string => `${signed(n)} pts`;

/** Short play line for the Lock Screen: who, and what it did for the user. */
export function headline(event: EnrichedPlayEvent | undefined): string {
  if (!event) return 'Waiting for the first play';
  const who = event.leagueImpacts[0]?.playerName ?? '';
  const text = event.description.replace(/^\([^)]*\)\s*/, '');
  return who && !text.includes(who.split(' ').pop() ?? '') ? `${who}: ${text}` : text;
}

export function buildContent(summaries: LiveMatchupSummary[], feed: EnrichedPlayEvent[], now: number): LiveActivityContent {
  const latest = feed[0];
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const today = feed.filter((e) => e.timestamp >= startOfDay.getTime());
  const net = round2(today.reduce((t, e) => t + e.totalNetPointsForUser, 0));
  const closest = summaries
    .filter((m) => m.opponentRosterId !== null)
    .sort((a, b) => Math.abs(a.pointDifferential) - Math.abs(b.pointDifferential))
    .slice(0, 2)
    .map((m) => `${m.leagueName} ${m.userPoints.toFixed(1)}–${m.opponentPoints.toFixed(1)}`);
  return {
    winningLeaguesCount: summaries.filter((m) => m.isWinning).length,
    totalActiveLeagues: summaries.length,
    netPortfolioPointsToday: net,
    latestPlayHeadline: headline(latest),
    latestPlayDeltaText: latest ? deltaText(latest.totalNetPointsForUser) : deltaText(0),
    isPositivePlay: (latest?.totalNetPointsForUser ?? 0) >= 0,
    updatedAtEpoch: Math.floor(now / 1000),
    closestMatchups: closest
  };
}
