// Keeps the slim player directory on device: load SQLite into the hot map at
// launch, then refresh at most once a day (ETag-aware through the BFF, so an
// unchanged directory costs a 304).
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { settings } from '../db/mmkvStorage';
import { countPlayers, loadAllPlayers, replaceAllPlayers } from '../db/sqliteClient';
import { odds } from '../lib/clients';
import { useNightOwlStore } from '../store/useNightOwlStore';

const DAY_MS = 24 * 3600000;

export interface PlayerDatabaseStatus {
  ready: boolean;
  syncing: boolean;
  count: number;
  error: Error | null;
}

async function syncPlayers(force: boolean): Promise<number> {
  const store = useNightOwlStore.getState();
  if (!store.playersReady) {
    const cached = await loadAllPlayers();
    if (Object.keys(cached).length) store.setPlayers(cached);
  }
  const stale = Date.now() - settings.getPlayersLastSyncMs() > DAY_MS;
  const empty = (await countPlayers()) === 0;
  if (!force && !stale && !empty) return Object.keys(useNightOwlStore.getState().players).length;

  const result = await odds.getSlimPlayers(empty ? null : settings.getPlayersEtag());
  if (result.status === 200 && result.players) {
    await replaceAllPlayers(result.players);
    useNightOwlStore.getState().setPlayers(Object.fromEntries(result.players.map((p) => [p.player_id, p])));
    if (result.etag) settings.setPlayersEtag(result.etag);
  }
  settings.setPlayersLastSyncMs(Date.now());
  return Object.keys(useNightOwlStore.getState().players).length;
}

export function usePlayerDatabase(): PlayerDatabaseStatus & { refresh: () => void } {
  const ready = useNightOwlStore((s) => s.playersReady);
  const query = useQuery({
    queryKey: ['players-directory'],
    queryFn: () => syncPlayers(false),
    staleTime: DAY_MS,
    gcTime: Infinity,
    retry: 2
  });

  // A failed refresh still leaves yesterday's directory usable.
  useEffect(() => {
    if (query.isError && !useNightOwlStore.getState().playersReady) {
      loadAllPlayers()
        .then((cached) => {
          if (Object.keys(cached).length) useNightOwlStore.getState().setPlayers(cached);
        })
        .catch(() => undefined);
    }
  }, [query.isError]);

  return {
    ready,
    syncing: query.isFetching,
    count: query.data ?? 0,
    error: query.error,
    refresh: () => {
      void syncPlayers(true).then(() => query.refetch());
    }
  };
}
