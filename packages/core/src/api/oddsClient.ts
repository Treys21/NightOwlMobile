// Vegas lines for a week. With EXPO_PUBLIC_BFF_URL set, the Cloudflare
// Worker serves a normalized slate (The Odds API behind a secret key, cached
// in KV). Without it — local development, or the Worker down — the app
// builds the same slate itself from keyless feeds: ESPN's DraftKings lines
// and spreads, priced with Sleeper Picks payouts.
import type { EspnPropBet, EspnPropBetsPage, NflGame } from '../types/espn';
import type { SeasonType, SlimNflPlayer } from '../types/sleeper';
import type { PlayerLookup } from '../engine/playerNormalizer';
import type { NormalizedPlayerProp, PicksMarket, VegasSlate } from '../types/vegas';
import { HttpClient, defaultHttp } from './http';
import { LiveFeedClient, liveFeedClient } from './liveFeedClient';
import { SleeperClient, sleeperClient } from './sleeperClient';
import { propsFromEspn } from '../engine/espnParsers';
import { parsePicksLines } from '../engine/picksMarkets';
import { emptyProp, gameEnvironmentFromGame, hasAnyLine, mergePicksIntoProp } from '../engine/vegasCalculator';

export const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const MAX_PROP_PAGES = 4;

export interface OddsClientOptions {
  bffUrl?: string | null;
  http?: HttpClient;
  sleeper?: SleeperClient;
  espn?: LiveFeedClient;
}

export interface SlimPlayersResult {
  status: 200 | 304;
  players: SlimNflPlayer[] | null;
  etag: string | null;
  source: 'bff' | 'sleeper';
}

export class OddsClient {
  private readonly bffUrl: string | null;
  private readonly http: HttpClient;
  private readonly sleeper: SleeperClient;
  private readonly espn: LiveFeedClient;

  constructor(options: OddsClientOptions = {}) {
    this.bffUrl = options.bffUrl ? options.bffUrl.replace(/\/+$/, '') : null;
    this.http = options.http ?? defaultHttp;
    this.sleeper = options.sleeper ?? sleeperClient;
    this.espn = options.espn ?? liveFeedClient;
  }

  get usesBff(): boolean {
    return this.bffUrl !== null;
  }

  /** The week's games and player props, from the BFF or the keyless fallback. */
  async getSlate(
    season: string,
    week: number,
    seasonType: SeasonType,
    players: Pick<PlayerLookup, 'byId' | 'byEspnId'>
  ): Promise<VegasSlate> {
    if (this.bffUrl) {
      try {
        return await this.http.getJson<VegasSlate>(`${this.bffUrl}/api/v1/odds?season=${season}&week=${week}&seasonType=${seasonType}`);
      } catch {
        // Fall through to the direct path: stale-but-present beats nothing.
      }
    }
    return this.directSlate(season, week, seasonType, players);
  }

  /** Keyless slate: ESPN game lines + DraftKings player lines, priced by Sleeper Picks. */
  async directSlate(
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
    const props = mergeSleeperPicks(perGame.flat(), picks, upcoming, (id) => players.byId(id)?.team ?? null);
    return {
      games: games.map(gameEnvironmentFromGame).filter((g): g is NonNullable<typeof g> => g !== null),
      props,
      source: 'espn',
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

  /** The slim player directory: the BFF's ETag-cached copy, else trimmed on device. */
  async getSlimPlayers(etag: string | null): Promise<SlimPlayersResult> {
    if (this.bffUrl) {
      try {
        const res = await this.http.getConditional<SlimNflPlayer[]>(`${this.bffUrl}/api/v1/players/slim`, etag);
        return { status: res.status, players: res.data, etag: res.etag, source: 'bff' };
      } catch {
        // Fall back to Sleeper directly.
      }
    }
    return { status: 200, players: await this.sleeper.getSlimPlayers(), etag: null, source: 'sleeper' };
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
