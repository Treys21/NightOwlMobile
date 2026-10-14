// Synchronous settings store. MMKV reads are JSI calls (no bridge hop), so
// the app can decide onboarding vs. tabs before the first frame.
import { createMMKV } from 'react-native-mmkv';
import type { SleeperUser } from '@nightowl/core';

export const storage = createMMKV({ id: 'nightowl-user-storage' });

export const StorageKeys = {
  ACTIVE_USER: 'nightowl.active_user',
  ACTIVE_SEASON: 'nightowl.active_season',
  INCLUDED_LEAGUE_IDS: 'nightowl.included_league_ids',
  LEAGUE_WEIGHTS: 'nightowl.league_weights',
  PLAYERS_LAST_SYNC_MS: 'nightowl.players_last_sync',
  HAPTICS_ENABLED: 'nightowl.haptics_enabled',
  SEASON_MODE: 'nightowl.season_mode',
  DRAFT_METHOD: 'nightowl.draft_method'
} as const;

function readJson<T>(key: string, guard: (value: unknown) => value is T): T | null {
  const raw = storage.getString(key);
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUser = (v: unknown): v is SleeperUser =>
  isRecord(v) && typeof v.user_id === 'string' && typeof v.username === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isWeights = (v: unknown): v is Record<string, number> =>
  isRecord(v) && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x));

export const settings = {
  getActiveUser: (): SleeperUser | null => readJson(StorageKeys.ACTIVE_USER, isUser),
  setActiveUser: (user: SleeperUser): void => storage.set(StorageKeys.ACTIVE_USER, JSON.stringify(user)),

  getSeason: (): string | null => storage.getString(StorageKeys.ACTIVE_SEASON) ?? null,
  setSeason: (season: string): void => storage.set(StorageKeys.ACTIVE_SEASON, season),

  getIncludedLeagueIds: (): string[] => readJson(StorageKeys.INCLUDED_LEAGUE_IDS, isStringArray) ?? [],
  setIncludedLeagueIds: (ids: string[]): void => storage.set(StorageKeys.INCLUDED_LEAGUE_IDS, JSON.stringify(ids)),

  getLeagueWeights: (): Record<string, number> => readJson(StorageKeys.LEAGUE_WEIGHTS, isWeights) ?? {},
  setLeagueWeights: (weights: Record<string, number>): void =>
    storage.set(StorageKeys.LEAGUE_WEIGHTS, JSON.stringify(weights)),

  getPlayersLastSyncMs: (): number => storage.getNumber(StorageKeys.PLAYERS_LAST_SYNC_MS) ?? 0,
  setPlayersLastSyncMs: (ms: number): void => storage.set(StorageKeys.PLAYERS_LAST_SYNC_MS, ms),

  getHapticsEnabled: (): boolean => storage.getBoolean(StorageKeys.HAPTICS_ENABLED) ?? true,
  setHapticsEnabled: (on: boolean): void => storage.set(StorageKeys.HAPTICS_ENABLED, on),

  getSeasonMode: (): 'now' | 'projected' => (storage.getString(StorageKeys.SEASON_MODE) === 'projected' ? 'projected' : 'now'),
  setSeasonMode: (mode: 'now' | 'projected'): void => storage.set(StorageKeys.SEASON_MODE, mode),

  getDraftMethod: (): 'linear' | 'inverse' => (storage.getString(StorageKeys.DRAFT_METHOD) === 'inverse' ? 'inverse' : 'linear'),
  setDraftMethod: (method: 'linear' | 'inverse'): void => storage.set(StorageKeys.DRAFT_METHOD, method),

  /** Forget the account (sign out); the players cache stays. */
  clearAccount: (): void => {
    storage.remove(StorageKeys.ACTIVE_USER);
    storage.remove(StorageKeys.INCLUDED_LEAGUE_IDS);
    storage.remove(StorageKeys.LEAGUE_WEIGHTS);
  }
};
