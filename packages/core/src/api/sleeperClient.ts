// Sleeper's public, read-only APIs. No auth: everything keys off a username
// or user id.
//
//   api.sleeper.app/v1   users, leagues, rosters, matchups, drafts, players
//   api.sleeper.com      live stat lines, projections, schedule
//   api.sleeper.app      Sleeper Picks over/unders
import type {
  SeasonType,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPicksEntry,
  SleeperRawPlayer,
  SleeperRoster,
  SleeperScheduleGame,
  SleeperStatRow,
  SleeperTradedPick,
  SleeperUser,
  SlimNflPlayer
} from '../types/sleeper';
import type { SleeperDraft, SleeperDraftPick } from '../types/draft';
import { HttpClient, HttpError, defaultHttp } from './http';
import { slimPlayerDirectory } from '../engine/playerNormalizer';

export const SLEEPER_V1 = 'https://api.sleeper.app/v1';
export const SLEEPER_WEB = 'https://api.sleeper.com';
export const SLEEPER_APP = 'https://api.sleeper.app';

/** Positions requested by default; IDP rows only for leagues that start IDP. */
export const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
export const IDP_POSITIONS = ['DL', 'LB', 'DB'] as const;

const positionsQuery = (positions: readonly string[]): string =>
  (positions.length ? positions : OFFENSE_POSITIONS).map((p) => `position[]=${encodeURIComponent(p)}`).join('&');

/** Sleeper avatar CDN: full-size or thumbnail. */
export const avatarUrl = (avatarId: string | null, thumb = true): string | null =>
  avatarId ? `https://sleepercdn.com/avatars/${thumb ? 'thumbs/' : ''}${avatarId}` : null;
export const headshotUrl = (playerId: string): string =>
  /^[A-Z]{2,3}$/.test(playerId)
    ? `https://sleepercdn.com/images/team_logos/nfl/${playerId.toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;
export const teamLogoUrl = (team: string): string => `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`;

export class SleeperClient {
  constructor(private readonly http: HttpClient = defaultHttp) {}

  getNflState(): Promise<SleeperNflState> {
    return this.http.getJson(`${SLEEPER_V1}/state/nfl`);
  }

  /** null when the username doesn't exist (Sleeper answers 404 or a literal null). */
  async getUser(usernameOrId: string): Promise<SleeperUser | null> {
    try {
      return await this.http.getJson<SleeperUser | null>(`${SLEEPER_V1}/user/${encodeURIComponent(usernameOrId.trim())}`);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
  }

  async getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    return (await this.http.getJson<SleeperLeague[] | null>(`${SLEEPER_V1}/user/${userId}/leagues/nfl/${season}`)) ?? [];
  }

  getLeague(leagueId: string): Promise<SleeperLeague> {
    return this.http.getJson(`${SLEEPER_V1}/league/${leagueId}`);
  }

  async getRosters(leagueId: string): Promise<SleeperRoster[]> {
    return (await this.http.getJson<SleeperRoster[] | null>(`${SLEEPER_V1}/league/${leagueId}/rosters`)) ?? [];
  }

  async getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
    return (await this.http.getJson<SleeperLeagueUser[] | null>(`${SLEEPER_V1}/league/${leagueId}/users`)) ?? [];
  }

  async getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return (await this.http.getJson<SleeperMatchup[] | null>(`${SLEEPER_V1}/league/${leagueId}/matchups/${week}`)) ?? [];
  }

  async getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    return (await this.http.getJson<SleeperTradedPick[] | null>(`${SLEEPER_V1}/league/${leagueId}/traded_picks`)) ?? [];
  }

  async getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    return (await this.http.getJson<SleeperDraft[] | null>(`${SLEEPER_V1}/league/${leagueId}/drafts`)) ?? [];
  }

  async getUserDrafts(userId: string, season: string): Promise<SleeperDraft[]> {
    return (await this.http.getJson<SleeperDraft[] | null>(`${SLEEPER_V1}/user/${userId}/drafts/nfl/${season}`)) ?? [];
  }

  getDraft(draftId: string): Promise<SleeperDraft> {
    return this.http.getJson(`${SLEEPER_V1}/draft/${draftId}`);
  }

  async getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    return (await this.http.getJson<SleeperDraftPick[] | null>(`${SLEEPER_V1}/draft/${draftId}/picks`)) ?? [];
  }

  /** The full ~5 MB directory. Sleeper asks that this be fetched at most once a day. */
  getAllPlayers(): Promise<Record<string, SleeperRawPlayer>> {
    return this.http.getJson(`${SLEEPER_V1}/players/nfl`);
  }

  /** On-device fallback for the BFF's slim directory. */
  async getSlimPlayers(): Promise<SlimNflPlayer[]> {
    return slimPlayerDirectory(await this.getAllPlayers());
  }

  async getSchedule(season: string, seasonType: SeasonType): Promise<SleeperScheduleGame[]> {
    return (await this.http.getJson<SleeperScheduleGame[] | null>(`${SLEEPER_WEB}/schedule/nfl/${seasonType}/${season}`)) ?? [];
  }

  async getWeekStats(season: string, week: number, seasonType: SeasonType, positions: readonly string[] = OFFENSE_POSITIONS): Promise<SleeperStatRow[]> {
    return (
      (await this.http.getJson<SleeperStatRow[] | null>(
        `${SLEEPER_WEB}/stats/nfl/${season}/${week}?season_type=${seasonType}&${positionsQuery(positions)}`
      )) ?? []
    );
  }

  async getWeekProjections(season: string, week: number, seasonType: SeasonType, positions: readonly string[] = OFFENSE_POSITIONS): Promise<SleeperStatRow[]> {
    return (
      (await this.http.getJson<SleeperStatRow[] | null>(
        `${SLEEPER_WEB}/projections/nfl/${season}/${week}?season_type=${seasonType}&${positionsQuery(positions)}`
      )) ?? []
    );
  }

  async getDefenseSeason(season: string, seasonType: SeasonType): Promise<SleeperStatRow[]> {
    return (await this.http.getJson<SleeperStatRow[] | null>(`${SLEEPER_WEB}/stats/nfl/${season}?season_type=${seasonType}&position[]=DEF`)) ?? [];
  }

  async getPicksLines(): Promise<SleeperPicksEntry[]> {
    return (await this.http.getJson<SleeperPicksEntry[] | null>(`${SLEEPER_APP}/lines/available?sport=nfl`)) ?? [];
  }
}

/** The week the app should show: Sleeper bumps `week` Monday night, before `display_week` catches up. */
export const activeWeek = (state: Pick<SleeperNflState, 'week' | 'display_week'>): number =>
  Math.max(state.week || 0, state.display_week || 0) || 1;

/** Regular or post: the season type stats and schedules are filed under. */
export const statSeasonType = (state: Pick<SleeperNflState, 'season_type'>): SeasonType =>
  state.season_type === 'post' ? 'post' : state.season_type === 'pre' ? 'pre' : 'regular';

export const sleeperClient = new SleeperClient();
