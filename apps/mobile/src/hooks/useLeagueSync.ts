// Fetches everything Sleeper knows about the user's tracked leagues: NFL
// state, the league list, rosters and users per league, and this week's
// matchups (every 15 s while games are live). Results land in the store,
// which rebuilds the inverted roster index.
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { activeWeek, isLiveWindow, statSeasonType } from '@nightowl/core';
import type { SleeperLeague } from '@nightowl/core';
import { IDLE_POLL_MS, LIVE_POLL_MS, espn, sleeper } from '../lib/clients';
import { activeLeagues, useNightOwlStore } from '../store/useNightOwlStore';

/** Redraft leagues that have not drafted yet have no rosters to sync. */
const playable = (l: SleeperLeague): boolean => l.status !== 'pre_draft' || l.settings.type !== 0;

export interface LeagueSyncStatus {
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  live: boolean;
  refresh: () => Promise<void>;
}

export function useLeagueSync(): LeagueSyncStatus {
  const user = useNightOwlStore((s) => s.user);
  const season = useNightOwlStore((s) => s.season);
  const week = useNightOwlStore((s) => s.week);
  const games = useNightOwlStore((s) => s.games);
  const leagues = useNightOwlStore((s) => s.leagues);
  const included = useNightOwlStore((s) => s.includedLeagueIds);
  const live = isLiveWindow(games, Date.now());
  const tracked = activeLeagues({ leagues, includedLeagueIds: included });

  const stateQuery = useQuery({
    queryKey: ['nfl-state'],
    queryFn: () => sleeper.getNflState(),
    staleTime: 10 * 60000,
    refetchInterval: 30 * 60000
  });

  useEffect(() => {
    const s = stateQuery.data;
    if (s) useNightOwlStore.getState().setNflState(s, activeWeek(s));
  }, [stateQuery.data]);

  const leaguesQuery = useQuery({
    queryKey: ['leagues', user?.user_id, season],
    queryFn: () => sleeper.getUserLeagues(user?.user_id ?? '', season ?? ''),
    enabled: !!user && !!season,
    staleTime: 30 * 60000
  });

  useEffect(() => {
    if (leaguesQuery.data) useNightOwlStore.getState().setLeagues(leaguesQuery.data.filter(playable));
  }, [leaguesQuery.data]);

  const slateQuery = useQuery({
    queryKey: ['slate', stateQuery.data?.season, week],
    queryFn: () => {
      const s = stateQuery.data;
      if (!s || !week) throw new Error('NFL state not loaded');
      return espn.getWeek(s.season, week, statSeasonType(s));
    },
    enabled: !!stateQuery.data && !!week,
    refetchInterval: live ? LIVE_POLL_MS : IDLE_POLL_MS
  });

  useEffect(() => {
    if (slateQuery.data) useNightOwlStore.getState().setSlate(slateQuery.data.games, slateQuery.data.teamsOnBye);
  }, [slateQuery.data]);

  const leagueQueries = useQueries({
    queries: tracked.map((l) => ({
      queryKey: ['league-data', l.league_id],
      queryFn: async () => {
        const [rosters, users] = await Promise.all([sleeper.getRosters(l.league_id), sleeper.getLeagueUsers(l.league_id)]);
        useNightOwlStore.getState().setLeagueData(l.league_id, rosters, users);
        return { rosters, users };
      },
      staleTime: live ? 5 * 60000 : 15 * 60000
    }))
  });

  const matchupQueries = useQueries({
    queries: tracked.map((l) => ({
      queryKey: ['matchups', l.league_id, week],
      queryFn: async () => {
        const matchups = await sleeper.getMatchups(l.league_id, week ?? 1);
        useNightOwlStore.getState().setMatchups(l.league_id, matchups);
        return matchups;
      },
      enabled: !!week && l.status === 'in_season',
      refetchInterval: live ? LIVE_POLL_MS : IDLE_POLL_MS
    }))
  });

  const all = [stateQuery, leaguesQuery, slateQuery, ...leagueQueries, ...matchupQueries];
  const firstError = all.find((q) => q.error)?.error ?? null;

  return {
    loading: stateQuery.isLoading || leaguesQuery.isLoading || leagueQueries.some((q) => q.isLoading),
    refreshing: all.some((q) => q.isFetching),
    error: firstError,
    live,
    refresh: async () => {
      await Promise.all(all.map((q) => q.refetch()));
    }
  };
}
