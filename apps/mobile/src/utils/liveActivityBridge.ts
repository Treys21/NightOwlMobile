// Pushes the scoreboard and the latest play to the Lock Screen and Dynamic
// Island. The native side is the local Expo module in
// modules/nightowl-live-activity (ActivityKit); in Expo Go or on iOS < 16.2
// it isn't present and these calls do nothing.
import { requireOptionalNativeModule } from 'expo';
import { round2 } from '@nightowl/core';
import type { EnrichedPlayEvent, LiveMatchupSummary } from '@nightowl/core';
import type { NightOwlState } from '../store/useNightOwlStore';

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

interface NightOwlLiveActivityModule {
  areActivitiesEnabled(): boolean;
  start(username: string, nflWeek: number, content: LiveActivityContent): Promise<string | null>;
  update(content: LiveActivityContent): Promise<void>;
  end(): Promise<void>;
  isRunning(): boolean;
}

const native = requireOptionalNativeModule<NightOwlLiveActivityModule>('NightOwlLiveActivity');

export const liveActivitiesAvailable = (): boolean => !!native && native.areActivitiesEnabled();

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

/** Start the activity when games are live, update it, end it when they're over. */
export async function updateLiveActivity(state: Pick<NightOwlState, 'user' | 'week' | 'games' | 'matchupSummaries' | 'feed'>): Promise<void> {
  if (!native || !native.areActivitiesEnabled() || !state.user || !state.week) return;
  const anyLive = state.games.some((g) => g.state === 'in');
  if (!anyLive) {
    if (native.isRunning()) await native.end();
    return;
  }
  const content = buildContent(state.matchupSummaries, state.feed, Date.now());
  if (native.isRunning()) await native.update(content);
  else await native.start(state.user.username, state.week, content);
}

export async function endLiveActivity(): Promise<void> {
  if (native?.isRunning()) await native.end();
}
