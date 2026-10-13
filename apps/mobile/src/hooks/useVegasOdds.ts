// The week's Vegas slate and every number derived from it: implied fantasy
// points per player under each league's scoring (or averaged across the
// portfolio), game environments, and the lineup audit that uses them.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  auditLineups,
  computeImpliedFantasyPoints,
  kickoffByTeam,
  ownsRoster,
  round2,
  statSeasonType
} from '@nightowl/core';
import type {
  GameEnvironmentOdds,
  LineupActionAlert,
  NormalizedPlayerProp,
  PlayerVegasProjection,
  ScoringSettings,
  SleeperRoster,
  VegasSlate
} from '@nightowl/core';
import { odds } from '../lib/clients';
import { activeLeagues, useNightOwlStore } from '../store/useNightOwlStore';

/** null = average across the portfolio's scoring systems. */
export type ScoringContext = string | null;

export interface VegasData {
  slate: VegasSlate | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  propsByPlayer: Map<string, NormalizedPlayerProp>;
  envByTeam: Map<string, GameEnvironmentOdds>;
  projection: (playerId: string, context: ScoringContext) => PlayerVegasProjection | null;
  impliedPoints: (playerId: string, context: ScoringContext) => number | null;
}

export function useVegasOdds(): VegasData {
  const nfl = useNightOwlStore((s) => s.nflState);
  const week = useNightOwlStore((s) => s.week);
  const lookup = useNightOwlStore((s) => s.lookup);
  const ready = useNightOwlStore((s) => s.playersReady);
  const players = useNightOwlStore((s) => s.players);
  const leagues = useNightOwlStore((s) => s.leagues);
  const included = useNightOwlStore((s) => s.includedLeagueIds);

  const query = useQuery({
    queryKey: ['vegas', nfl?.season, week],
    queryFn: () => {
      if (!nfl || !week) throw new Error('NFL state not loaded');
      return odds.getSlate(nfl.season, week, statSeasonType(nfl), lookup);
    },
    enabled: !!nfl && !!week && ready,
    staleTime: 15 * 60000,
    refetchInterval: 15 * 60000
  });

  return useMemo(() => {
    const slate = query.data ?? null;
    const propsByPlayer = new Map((slate?.props ?? []).map((p) => [p.playerId, p]));
    const envByTeam = new Map<string, GameEnvironmentOdds>();
    for (const g of slate?.games ?? []) {
      envByTeam.set(g.homeTeam, g);
      envByTeam.set(g.awayTeam, g);
    }
    const tracked = activeLeagues({ leagues, includedLeagueIds: included });
    const scoringOf = new Map<string, ScoringSettings>(tracked.map((l) => [l.league_id, l.scoring_settings]));

    const projectionUnder = (pid: string, scoring: ScoringSettings, leagueId: string): PlayerVegasProjection | null => {
      const prop = propsByPlayer.get(pid);
      const player = players[pid];
      if (!prop || !player) return null;
      return computeImpliedFantasyPoints(prop, player, scoring, leagueId, player.team ? (envByTeam.get(player.team) ?? null) : null);
    };

    const projection = (pid: string, context: ScoringContext): PlayerVegasProjection | null => {
      if (context) {
        const scoring = scoringOf.get(context);
        return scoring ? projectionUnder(pid, scoring, context) : null;
      }
      const all = tracked.map((l) => projectionUnder(pid, l.scoring_settings, l.league_id)).filter((p): p is PlayerVegasProjection => p !== null);
      const first = all[0];
      if (!first) return null;
      const avg = (pick: (p: PlayerVegasProjection) => number): number => round2(all.reduce((t, p) => t + pick(p), 0) / all.length);
      return {
        ...first,
        leagueId: '',
        impliedFantasyPoints: avg((p) => p.impliedFantasyPoints),
        breakdown: {
          passingPoints: avg((p) => p.breakdown.passingPoints),
          rushingPoints: avg((p) => p.breakdown.rushingPoints),
          receivingPoints: avg((p) => p.breakdown.receivingPoints),
          touchdownPoints: avg((p) => p.breakdown.touchdownPoints)
        }
      };
    };

    return {
      slate,
      loading: query.isLoading,
      error: query.error,
      refetch: () => void query.refetch(),
      propsByPlayer,
      envByTeam,
      projection,
      impliedPoints: (pid, context) => projection(pid, context)?.impliedFantasyPoints ?? null
    };
  }, [query.data, query.isLoading, query.error, query.refetch, players, leagues, included]);
}

/** Lineup alerts across tracked leagues (OUT / bye / Questionable / Vegas upgrade). */
export function useLineupAlerts(vegas: VegasData): LineupActionAlert[] {
  const user = useNightOwlStore((s) => s.user);
  const week = useNightOwlStore((s) => s.week);
  const leagues = useNightOwlStore((s) => s.leagues);
  const included = useNightOwlStore((s) => s.includedLeagueIds);
  const rostersByLeague = useNightOwlStore((s) => s.rostersByLeague);
  const matchupsByLeague = useNightOwlStore((s) => s.matchupsByLeague);
  const players = useNightOwlStore((s) => s.players);
  const games = useNightOwlStore((s) => s.games);
  const teamsOnBye = useNightOwlStore((s) => s.teamsOnBye);

  return useMemo(() => {
    if (!user || !week) return [];
    const tracked = activeLeagues({ leagues, includedLeagueIds: included }).filter((l) => l.status === 'in_season');
    const userRosters: Record<string, SleeperRoster> = {};
    const startersByLeague: Record<string, string[]> = {};
    for (const l of tracked) {
      const mine = (rostersByLeague[l.league_id] ?? []).find((r) => ownsRoster(r, user.user_id));
      if (!mine) continue;
      userRosters[l.league_id] = mine;
      const m = (matchupsByLeague[l.league_id] ?? []).find((x) => x.roster_id === mine.roster_id);
      if (m) startersByLeague[l.league_id] = m.starters;
    }
    return auditLineups({
      leagues: tracked,
      userRosters,
      startersByLeague,
      playersMap: players,
      week,
      teamsOnBye: new Set(teamsOnBye),
      kickoffByTeam: kickoffByTeam(games),
      now: Date.now(),
      impliedPoints: (pid, leagueId) => vegas.impliedPoints(pid, leagueId)
    });
  }, [user, week, leagues, included, rostersByLeague, matchupsByLeague, players, games, teamsOnBye, vegas]);
}
