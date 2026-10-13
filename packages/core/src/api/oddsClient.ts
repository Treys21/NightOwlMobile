// Vegas lines for a week, from keyless feeds: ESPN's DraftKings player lines
// and spreads, priced with Sleeper Picks payouts.
import type { EspnPropBet, EspnPropBetsPage, NflGame } from '../types/espn';
import type { SeasonType } from '../types/sleeper';
import type { NormalizedPlayerProp, PicksMarket, VegasSlate } from '../types/vegas';
import type { PlayerLookup } from '../engine/playerNormalizer';
import { HttpClient, defaultHttp } from './http';
import { LiveFeedClient, liveFeedClient } from './liveFeedClient';
import { SleeperClient, sleeperClient } from './sleeperClient';
import { propsFromEspn } from '../engine/espnParsers';
import { parsePicksLines } from '../engine/picksMarkets';
import { emptyProp, gameEnvironmentFromGame, hasAnyLine, mergePicksIntoProp } from '../engine/vegasCalculator';

export const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const MAX_PROP_PAGES = 4;

export interface OddsClientOptions {
  http?: HttpClient;
  sleeper?: SleeperClient;
  espn?: LiveFeedClient;
}

export class OddsClient {
  private readonly http: HttpClient;
  private readonly sleeper: SleeperClient;
  private readonly espn: LiveFeedClient;

  constructor(options: OddsClientOptions = {}) {
    this.http = options.http ?? defaultHttp;
    this.sleeper = options.sleeper ?? sleeperClient;
    this.espn = options.espn ?? liveFeedClient;
  }

  /** The week's games and player props. */
  async getSlate(
    season: string,
    week: number,
    seasonType: SeasonType,
    players: Pick<PlayerLookup, 'byId' | 'byEspnId'>
  ): Promise<VegasSlate> {
    const [{ games }, picksRaw] = await Promise.all([
      this.espn.getWeek(season, week, seasonType),
      this.sleeper.getPicksLines().catch(() => [])
    ]);
    const picks = parsePicksLines(picksRaw);
    const upcoming = games.filter((g) => g.state === 'pre');
    const perGame = await Promise.all(
      upcoming.map(async (g) => {
        const items = await this.propBets(g.id).catch((): EspnPropBet[] => []);
        return propsFromEspn(items, g, (espnId) => {
          const p = players.byEspnId(espnId);
          return p ? { playerId: p.player_id, team: p.team } : null;
        });
      })
    );
    return {
      games: games.map(gameEnvironmentFromGame).filter((g): g is NonNullable<typeof g> => g !== null),
      props: mergeSleeperPicks(perGame.flat(), picks, upcoming, (id) => players.byId(id)?.team ?? null),
      fetchedAtMs: Date.now()
    };
  }

  /** DraftKings props for one ESPN event, all pages (capped at 4). */
  async propBets(eventId: string): Promise<EspnPropBet[]> {
    const base = `${ESPN_CORE}/events/${eventId}/competitions/${eventId}/odds/100/propBets?limit=1000`;
    const first = await this.http.getJson<EspnPropBetsPage>(base);
    const items = [...(first.items ?? [])];
    for (let page = 2; page <= Math.min(first.pageCount ?? 1, MAX_PROP_PAGES); page++) {
      const next = await this.http.getJson<EspnPropBetsPage>(`${base}&page=${page}`);
      items.push(...(next.items ?? []));
    }
    return items;
  }
}

/**
 * Add Sleeper Picks prices to ESPN props, and props for players Sleeper
 * prices but ESPN doesn't list (matched to a game by team).
 */
export function mergeSleeperPicks(
  props: NormalizedPlayerProp[],
  picks: Record<string, PicksMarket[]>,
  games: NflGame[],
  teamOf: (playerId: string) => string | null
): NormalizedPlayerProp[] {
  const byId = new Map(props.map((p) => [p.playerId, p]));
  for (const [pid, markets] of Object.entries(picks)) {
    const existing = byId.get(pid);
    if (existing) {
      byId.set(pid, mergePicksIntoProp(existing, markets));
      continue;
    }
    const team = teamOf(pid);
    const game = team ? games.find((g) => g.home === team || g.away === team) : undefined;
    if (!game || !team) continue;
    const merged = mergePicksIntoProp(emptyProp(pid, game.id, team, game.home === team ? game.away : game.home), markets);
    if (hasAnyLine(merged)) byId.set(pid, merged);
  }
  return [...byId.values()];
}
