// The Season tab for one league: standings as they stand (a live week counts
// as if it ended now), playoff odds, next year's draft order in keeper and
// dynasty leagues, and on demand the projected rest of the season: final
// records, playoff / bye / title odds, the end-of-season draft order and a
// projected bracket. Same logic as the Chrome extension's Season tool.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  asItStands,
  availability,
  bracketFormat,
  hashSeed,
  optimalLineup,
  outlook,
  ownsRoster,
  pickOwners,
  playoffOdds,
  playoffWeeks,
  powerRatings,
  projectSeason,
  standings,
  statLinePoints,
  teamNameFor,
  teamStrength,
  teamWeek,
  weeksRecorded
} from '@nightowl/core';
import type {
  FantasyPosition,
  ProjectionWeek,
  SeasonProjection,
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  StandingsRow,
  StatLine,
  TeamWeekOutlook,
  WeekScores
} from '@nightowl/core';
import { sleeper } from '../lib/clients';
import { activeLeagues, useNightOwlStore } from '../store/useNightOwlStore';

export type SeasonMode = 'now' | 'projected';
export type DraftMethod = 'linear' | 'inverse';

const KEEPS_PLAYERS = new Set([1, 2]);
const IDP_SLOTS = new Set(['DL', 'LB', 'DB', 'IDP_FLEX']);
const OFFENSE = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
export const SIMS = 2000;

export interface SeasonRow extends StandingsRow {
  name: string;
  power: number | null;
  playoffOdds: number | null;
}

export interface SeasonLeague {
  league: SleeperLeague;
  rows: SeasonRow[];
  me: SeasonRow | null;
  nameOf: (rosterId: number) => string;
  /** First week not yet in Sleeper's records, and whether it's being played. */
  next: number;
  inProgress: boolean;
  /** The week under way already has points on the board. */
  liveScored: boolean;
  playoffStart: number;
  playoffTeams: number;
  medianGame: boolean;
  regularSeasonLeft: boolean;
  draft: { season: number; rounds: number; owner: (round: number, rosterId: number) => number } | null;
}

/** Leagues the Season tab covers: tracked and in season. */
export function useSeasonLeagues(): SleeperLeague[] {
  const leagues = useNightOwlStore((s) => s.leagues);
  const included = useNightOwlStore((s) => s.includedLeagueIds);
  return useMemo(() => activeLeagues({ leagues, includedLeagueIds: included }).filter((l) => l.status === 'in_season'), [leagues, included]);
}

const pairsOf = (matchups: SleeperMatchup[]): Array<[number, number]> => {
  const byMatch = new Map<number, number[]>();
  for (const m of matchups) {
    if (m.matchup_id === null) continue;
    byMatch.set(m.matchup_id, [...(byMatch.get(m.matchup_id) ?? []), m.roster_id]);
  }
  return [...byMatch.values()].filter((p): p is [number, number] => p.length === 2) as Array<[number, number]>;
};

export function useSeason(leagueId: string | null, mode: SeasonMode, method: DraftMethod) {
  const user = useNightOwlStore((s) => s.user);
  const nfl = useNightOwlStore((s) => s.nflState);
  const leagues = useNightOwlStore((s) => s.leagues);
  const rostersByLeague = useNightOwlStore((s) => s.rostersByLeague);
  const usersByLeague = useNightOwlStore((s) => s.usersByLeague);
  const players = useNightOwlStore((s) => s.players);
  const games = useNightOwlStore((s) => s.games);

  const league = leagues.find((l) => l.league_id === leagueId) ?? null;
  const rosters = leagueId ? (rostersByLeague[leagueId] ?? []) : [];
  const users = leagueId ? (usersByLeague[leagueId] ?? []) : [];
  const settings = league?.settings;
  const start = settings?.start_week ?? 1;
  const playoffStart = settings?.playoff_week_start ?? 15;
  const playoffTeams = settings?.playoff_teams ?? 0;
  const medianGame = settings?.league_average_match === 1;
  const keeps = KEEPS_PLAYERS.has(settings?.type ?? 0);
  const recorded = rosters.length ? weeksRecorded(rosters, { medianGame }) : 0;
  const next = start + recorded;
  const inProgress = !!nfl && next <= nfl.week && next < playoffStart;
  const finished = useMemo(() => {
    const out: number[] = [];
    for (let w = start; w < start + recorded && w < playoffStart; w++) out.push(w);
    return out;
  }, [start, recorded, playoffStart]);

  const positionsOf = (pid: string): FantasyPosition[] => players[pid]?.fantasy_positions ?? [];

  // Finished weeks never change.
  const scoresQuery = useQuery({
    queryKey: ['season-scores', leagueId, finished.join(',')],
    enabled: !!leagueId && finished.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<WeekScores[]> => {
      const weeks = await Promise.all(finished.map((w) => sleeper.getMatchups(leagueId ?? '', w)));
      return weeks.map((ms) => Object.fromEntries(ms.map((m) => [String(m.roster_id), m.points ?? null])));
    }
  });

  const liveQuery = useQuery({
    queryKey: ['season-live', leagueId, next],
    enabled: !!leagueId && inProgress,
    refetchInterval: 2 * 60000,
    queryFn: () => sleeper.getMatchups(leagueId ?? '', next)
  });

  const tradedQuery = useQuery({
    queryKey: ['traded-picks', leagueId],
    enabled: !!leagueId && keeps,
    staleTime: 30 * 60000,
    queryFn: () => sleeper.getTradedPicks(leagueId ?? '')
  });

  // Sleeper publishes the whole regular-season schedule up front.
  const scheduleFrom = inProgress ? next + 1 : next;
  const scheduleQuery = useQuery({
    queryKey: ['season-schedule', leagueId, scheduleFrom, playoffStart],
    enabled: !!leagueId && scheduleFrom < playoffStart && playoffTeams > 0,
    staleTime: 24 * 3600000,
    queryFn: async (): Promise<Array<Array<[number, number]>>> => {
      const weeks: number[] = [];
      for (let w = scheduleFrom; w < playoffStart; w++) weeks.push(w);
      return (await Promise.all(weeks.map((w) => sleeper.getMatchups(leagueId ?? '', w)))).map(pairsOf);
    }
  });

  const format = useMemo(() => bracketFormat(playoffTeams, playoffStart, settings?.playoff_round_type ?? 0), [playoffTeams, playoffStart, settings?.playoff_round_type]);
  const projectionWeeks = useMemo(() => {
    const out: number[] = [];
    for (let w = next; w < playoffStart; w++) out.push(w);
    return [...out, ...playoffWeeks(format)].filter((w) => w <= 18);
  }, [next, playoffStart, format]);
  const positions = useMemo(() => {
    const set = new Set(OFFENSE);
    if (league?.roster_positions.some((s) => IDP_SLOTS.has(s))) ['DL', 'LB', 'DB'].forEach((p) => set.add(p));
    return [...set].sort();
  }, [league]);

  // Weekly projections (~240 KB a week), trimmed to this league's rosters.
  const projectionsQuery = useQuery({
    queryKey: ['season-projections', nfl?.season, leagueId, projectionWeeks.join(','), positions.join(',')],
    enabled: mode === 'projected' && !!nfl && !!leagueId && next < playoffStart && rosters.length > 0,
    staleTime: 6 * 3600000,
    gcTime: 6 * 3600000,
    queryFn: async (): Promise<Record<number, Record<string, StatLine>>> => {
      const keep = new Set(rosters.flatMap((r) => r.players ?? []));
      const rows = await Promise.all(projectionWeeks.map((w) => sleeper.getWeekProjections(nfl?.season ?? '', w, 'regular', positions)));
      const out: Record<number, Record<string, StatLine>> = {};
      projectionWeeks.forEach((w, i) => {
        const week: Record<string, StatLine> = {};
        for (const r of rows[i] ?? []) if (keep.has(r.player_id) && r.stats) week[r.player_id] = r.stats;
        out[w] = week;
      });
      return out;
    }
  });

  const view = useMemo((): SeasonLeague | null => {
    if (!league || !user || !rosters.length) return null;
    const weeks = scoresQuery.data ?? [];
    const live = liveQuery.data ?? [];
    const liveScored = inProgress && live.some((m) => m.points > 0);
    let counted: SleeperRoster[] = rosters;
    let allWeeks = weeks;
    if (liveScored) {
      const byRoster = new Map(rosters.map((r) => [r.roster_id, r]));
      const maxes = new Map(
        live.map((m) => {
          const r = byRoster.get(m.roster_id);
          const away = new Set([...(r?.reserve ?? []), ...(r?.taxi ?? [])]);
          const pool = (m.players ?? []).filter((pid) => !away.has(pid));
          const best = optimalLineup(league.roster_positions, pool, (pid) => m.players_points?.[pid] ?? 0, positionsOf);
          return [m.roster_id, Math.max(best.points, m.points ?? 0)];
        })
      );
      counted = asItStands(rosters, live, (id) => maxes.get(id) ?? null, { medianGame });
      allWeeks = [...weeks, Object.fromEntries(live.map((m) => [String(m.roster_id), m.points ?? 0]))];
    }
    const byId = new Map(rosters.map((r) => [r.roster_id, r]));
    const nameOf = (rosterId: number): string => teamNameFor(byId.get(rosterId), users);
    const base = standings(counted, allWeeks, { medianGame });
    const power = powerRatings(base, weeks.length ? weeks : allWeeks);
    let odds: Record<number, number> | null = null;
    if (playoffTeams && next < playoffStart && scheduleQuery.data) {
      odds = playoffOdds({
        teams: base.map((r) => ({ rosterId: r.rosterId, wins: r.wins, ties: r.ties, pf: r.pf, ...teamStrength(weeks, r.rosterId) })),
        schedule: scheduleQuery.data,
        playoffTeams,
        medianGame,
        sims: SIMS,
        seed: hashSeed(`${league.league_id}:${next}`)
      });
    }
    const rows: SeasonRow[] = base.map((r) => ({ ...r, name: nameOf(r.rosterId), power: power[r.rosterId] ?? null, playoffOdds: odds ? (odds[r.rosterId] ?? null) : null }));
    const mine = rosters.find((r) => ownsRoster(r, user.user_id));
    return {
      league,
      rows,
      me: rows.find((r) => r.rosterId === mine?.roster_id) ?? null,
      nameOf,
      next,
      inProgress,
      liveScored,
      playoffStart,
      playoffTeams,
      medianGame,
      regularSeasonLeft: next < playoffStart,
      draft: keeps
        ? { season: Number(league.season) + 1, rounds: settings?.draft_rounds ?? 4, owner: pickOwners(tradedQuery.data ?? [], String(Number(league.season) + 1)) }
        : null
    };
  }, [league, user, rosters, users, players, scoresQuery.data, liveQuery.data, scheduleQuery.data, tradedQuery.data, inProgress, next, playoffStart, playoffTeams, medianGame, keeps, settings]);

  const projection = useMemo((): SeasonProjection | null => {
    const stats = projectionsQuery.data;
    if (mode !== 'projected' || !view || !league || !stats || (playoffTeams && !scheduleQuery.data)) return null;
    const scoring = league.scoring_settings;
    const projOf = (week: number) => (pid: string): number => statLinePoints(stats[week]?.[pid], scoring);
    const outIn = availability((pid) => players[pid]?.injury_status ?? null);
    const pools = new Map(rosters.map((r) => {
      const away = new Set([...(r.reserve ?? []), ...(r.taxi ?? [])]);
      return [r.roster_id, (r.players ?? []).filter((pid) => !away.has(pid))];
    }));
    const weekTeams = (week: number, index: number): Record<number, TeamWeekOutlook> =>
      Object.fromEntries(rosters.map((r) => [r.roster_id, teamWeek(league.roster_positions, pools.get(r.roster_id) ?? [], projOf(week), positionsOf, outIn(index))]));

    const remaining = new Map<string, number>();
    for (const g of games) {
      remaining.set(g.home, g.remaining);
      remaining.set(g.away, g.remaining);
    }
    const weeks: ProjectionWeek[] = [];
    let index = 0;
    if (inProgress) {
      const teams: Record<number, TeamWeekOutlook> = {};
      for (const m of liveQuery.data ?? []) {
        const o = outlook(
          (m.starters ?? [])
            .filter((pid) => pid && pid !== '0')
            .map((pid) => ({ points: m.players_points?.[pid] ?? 0, proj: projOf(next)(pid), remaining: remaining.get(players[pid]?.team ?? '') ?? 0 }))
        );
        teams[m.roster_id] = { mean: o.mean, variance: o.variance, lineupSet: true };
      }
      weeks.push({ week: next, pairs: pairsOf(liveQuery.data ?? []), teams });
      index = 1;
    }
    const schedule = scheduleQuery.data ?? [];
    for (let w = scheduleFrom, i = 0; w < playoffStart; w++, i++) weeks.push({ week: w, pairs: schedule[i] ?? [], teams: weekTeams(w, index + i) });
    const playoffTeamsByWeek: Record<number, Record<number, TeamWeekOutlook>> = {};
    playoffWeeks(format).forEach((w, i) => {
      playoffTeamsByWeek[w] = weekTeams(w, weeks.length + i);
    });
    const points = (whole: number | undefined, decimal: number | undefined): number => (whole ?? 0) + (decimal ?? 0) / 100;
    return projectSeason({
      teams: rosters.map((r) => {
        const pf = points(r.settings.fpts, r.settings.fpts_decimal);
        const max = points(r.settings.ppts, r.settings.ppts_decimal);
        return { rosterId: r.roster_id, wins: r.settings.wins ?? 0, losses: r.settings.losses ?? 0, ties: r.settings.ties ?? 0, pf, max, efficiency: max ? pf / max : null };
      }),
      weeks,
      playoff: format ? { format, teams: playoffTeamsByWeek } : null,
      medianGame,
      sims: SIMS,
      seed: hashSeed(`${league.league_id}:${next}:projected`),
      draft: keeps ? { method } : null
    });
  }, [mode, view, league, projectionsQuery.data, scheduleQuery.data, liveQuery.data, games, players, rosters, method, format, inProgress, next, playoffStart, scheduleFrom, medianGame, keeps]);

  const queries = [scoresQuery, liveQuery, tradedQuery, scheduleQuery, projectionsQuery];
  return {
    view,
    projection,
    loading: !view || scoresQuery.isLoading,
    projecting: mode === 'projected' && (projectionsQuery.isLoading || (playoffTeams > 0 && scheduleQuery.isLoading) || (!!projectionsQuery.data && !projection && view?.regularSeasonLeft === true)),
    error: queries.find((q) => q.error)?.error ?? null,
    refresh: () => {
      for (const q of queries) void q.refetch();
    }
  };
}
