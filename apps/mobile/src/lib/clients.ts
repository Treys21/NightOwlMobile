// One set of API clients for the app. Every feed is public; there is no server.
import { OddsClient, defaultHttp, liveFeedClient, sleeperClient } from '@nightowl/core';

export const sleeper = sleeperClient;
export const espn = liveFeedClient;
export const odds = new OddsClient({ http: defaultHttp, sleeper: sleeperClient, espn: liveFeedClient });

/** Poll every 15 s while games are live, every 2 minutes otherwise. */
export const LIVE_POLL_MS = 15000;
export const IDLE_POLL_MS = 120000;
/** Draft picks poll every 5 s while a draft is live. */
export const DRAFT_POLL_MS = 5000;
