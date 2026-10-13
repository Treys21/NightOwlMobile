// ESPN's public NFL site API: the scoreboard (kickoffs, clocks, lines, bye
// teams), per-game play-by-play, and the league injury report. A native app
// sends no browser Origin, so these are fetched directly.
import type { EspnInjuryFeed, EspnScoreboard, EspnSummary, NflGame } from '../types/espn';
import type { SeasonType } from '../types/sleeper';
import { HttpClient, defaultHttp } from './http';
import { parseScoreboard } from '../engine/espnParsers';

export const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

/** A finished game stays in the live feed this long after the final whistle. */
export const RECENTLY_FINAL_MS = 30 * 60000;
/** No NFL game runs longer than this from kickoff, overtime included. */
const LONGEST_GAME_MS = 4.5 * 3600000;

export class LiveFeedClient {
  constructor(private readonly http: HttpClient = defaultHttp) {}

  /** Today's slate, or a given week's when season and week are passed. */
  getScoreboard(season?: string, week?: number, seasonType: SeasonType = 'regular'): Promise<EspnScoreboard> {
    const type = seasonType === 'post' ? 3 : seasonType === 'pre' ? 1 : 2;
    const query = season && week ? `?seasontype=${type}&week=${week}&dates=${season}` : '';
    return this.http.getJson(`${ESPN_SITE}/scoreboard${query}`);
  }

  getSummary(espnGameId: string): Promise<EspnSummary> {
    return this.http.getJson(`${ESPN_SITE}/summary?event=${encodeURIComponent(espnGameId)}`);
  }

  getInjuries(): Promise<EspnInjuryFeed> {
    return this.http.getJson(`${ESPN_SITE}/injuries`);
  }

  async getWeek(season: string, week: number, seasonType: SeasonType): Promise<{ games: NflGame[]; teamsOnBye: string[] }> {
    const { games, teamsOnBye } = parseScoreboard(await this.getScoreboard(season, week, seasonType));
    return { games, teamsOnBye };
  }
}

/**
 * Games whose plays are worth polling: in progress, or final within the last
 * half hour (late stat corrections land then). `finalSeenAt` remembers when
 * each game was first seen final.
 */
export function gamesToPoll(games: NflGame[], finalSeenAt: Map<string, number>, now: number): NflGame[] {
  return games.filter((g) => {
    if (g.state === 'in') return true;
    if (g.state !== 'post') return false;
    // A game that ended long before we first looked is history, not live.
    if (!finalSeenAt.has(g.id)) finalSeenAt.set(g.id, now - g.kickoff > LONGEST_GAME_MS ? now - RECENTLY_FINAL_MS - 1 : now);
    return now - (finalSeenAt.get(g.id) ?? now) <= RECENTLY_FINAL_MS;
  });
}

/** True while any game is live or about to start: poll fast. */
export const isLiveWindow = (games: NflGame[], now: number): boolean =>
  games.some((g) => g.state === 'in' || (g.state === 'pre' && g.kickoff - now < 10 * 60000 && g.kickoff - now > -3 * 3600000));

export const liveFeedClient = new LiveFeedClient();
