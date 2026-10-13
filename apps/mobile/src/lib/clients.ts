// One set of API clients for the app. EXPO_PUBLIC_BFF_URL points at the
// Cloudflare Worker; unset, odds and players are built on device.
import { OddsClient, defaultHttp, liveFeedClient, sleeperClient } from '@nightowl/core';

export const BFF_URL: string | null = process.env.EXPO_PUBLIC_BFF_URL?.trim() || null;

export const sleeper = sleeperClient;
export const espn = liveFeedClient;
export const odds = new OddsClient({ bffUrl: BFF_URL, http: defaultHttp, sleeper: sleeperClient, espn: liveFeedClient });

/** Poll every 15 s while games are live, every 2 minutes otherwise. */
export const LIVE_POLL_MS = 15000;
export const IDLE_POLL_MS = 120000;
/** Draft picks poll every 5 s while a draft is live. */
export const DRAFT_POLL_MS = 5000;
