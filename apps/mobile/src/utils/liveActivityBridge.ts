// Pushes the scoreboard and the latest play to the Lock Screen and Dynamic
// Island. The native side is the local Expo module in
// modules/nightowl-live-activity (ActivityKit); in Expo Go or on iOS < 16.2
// it isn't present and these calls do nothing.
import { requireOptionalNativeModule } from 'expo';
import { buildContent } from './liveActivityContent';
import type { LiveActivityContent } from './liveActivityContent';
import type { NightOwlState } from '../store/useNightOwlStore';

interface NightOwlLiveActivityModule {
  areActivitiesEnabled(): boolean;
  start(username: string, nflWeek: number, content: LiveActivityContent): Promise<string | null>;
  update(content: LiveActivityContent): Promise<void>;
  end(): Promise<void>;
  isRunning(): boolean;
}

const native = requireOptionalNativeModule<NightOwlLiveActivityModule>('NightOwlLiveActivity');

export const liveActivitiesAvailable = (): boolean => !!native && native.areActivitiesEnabled();

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
