// The ~10 MB /players/nfl dump trimmed to active fantasy players (~2,500
// rows, ~450 KB gzipped), hashed for an ETag and cached in KV for a day.
import { slimPlayerDirectory } from '@nightowl/core';
import type { SleeperRawPlayer, SlimNflPlayer } from '@nightowl/core';
import type { Env } from './env';

export const PLAYERS_KEY = 'players:slim:v1';
export const PLAYERS_TTL_SECONDS = 24 * 3600;
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

export interface SlimPlayersRecord {
  etag: string;
  body: string;
  builtAtMs: number;
  count: number;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fetch Sleeper's directory and slim it. */
export async function buildSlimPlayers(fetcher: typeof fetch = fetch): Promise<SlimNflPlayer[]> {
  const res = await fetcher(SLEEPER_PLAYERS_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper players returned ${res.status}`);
  const raw = (await res.json()) as Record<string, SleeperRawPlayer>;
  return slimPlayerDirectory(raw);
}

/** Build, hash and store the directory; returns the stored record. */
export async function refreshSlimPlayers(env: Env, fetcher: typeof fetch = fetch): Promise<SlimPlayersRecord> {
  const players = await buildSlimPlayers(fetcher);
  const body = JSON.stringify(players);
  const record: SlimPlayersRecord = { etag: `"${await sha256Hex(body)}"`, body, builtAtMs: Date.now(), count: players.length };
  await env.NIGHTOWL_KV.put(PLAYERS_KEY, JSON.stringify(record), { expirationTtl: PLAYERS_TTL_SECONDS });
  return record;
}

/** The cached directory, rebuilt on a miss. */
export async function getSlimPlayers(env: Env, fetcher: typeof fetch = fetch): Promise<SlimPlayersRecord> {
  const cached = await env.NIGHTOWL_KV.get<SlimPlayersRecord>(PLAYERS_KEY, 'json');
  return cached ?? refreshSlimPlayers(env, fetcher);
}

/** The players lookup the odds normalizer needs, from the cached directory. */
export async function slimPlayersList(env: Env, fetcher: typeof fetch = fetch): Promise<SlimNflPlayer[]> {
  const record = await getSlimPlayers(env, fetcher);
  return JSON.parse(record.body) as SlimNflPlayer[];
}
