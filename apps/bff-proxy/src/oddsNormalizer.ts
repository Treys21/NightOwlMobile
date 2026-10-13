// A week's Vegas slate, normalized to Sleeper player ids.
//
// With ODDS_API_KEY: game lines and DraftKings player props from The Odds
// API (v4), sportsbook names matched to Sleeper ids at the edge. Without it:
// the same keyless slate the app can build itself (ESPN lines priced by
// Sleeper Picks). Either way the result is cached in KV for 15 minutes.
import {
  OddsClient,
  HttpClient,
  LiveFeedClient,
  SleeperClient,
  anytimeTdFairProbability,
  buildPlayerLookup,
  emptyProp,
  gameEnvironmentFromGame,
  hasAnyLine,
  mergeSleeperPicks,
  parsePicksLines,
  round2
} from '@nightowl/core';
import type { GameEnvironmentOdds, NflGame, NormalizedPlayerProp, PlayerLookup, SeasonType, VegasSlate } from '@nightowl/core';
import type { Env } from './env';
import { slimPlayersList } from './slimPlayers';

export const ODDS_TTL_SECONDS = 15 * 60;
const ODDS_API = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
const PROP_MARKETS = [
  'player_pass_yds',
  'player_pass_tds',
  'player_pass_interceptions',
  'player_rush_yds',
  'player_receptions',
  'player_reception_yds',
  'player_anytime_td'
].join(',');
const BOOKMAKER = 'draftkings';

export const oddsKey = (season: string, seasonType: SeasonType, week: number): string => `odds:v1:${season}:${seasonType}:${week}`;

/** The Odds API team names → Sleeper codes. */
export const TEAM_CODES: Record<string, string> = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL', 'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI', 'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL', 'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX', 'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC', 'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN', 'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT', 'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB', 'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
};

export interface OddsApiOutcome {
  name: string;
  description?: string;
  price: number;
  point?: number;
}

export interface OddsApiMarket {
  key: string;
  last_update?: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{ key: string; last_update?: string; markets: OddsApiMarket[] }>;
}

/** Spread and total from a featured-odds event → environment for the ESPN game. */
export function environmentFromOddsApi(event: OddsApiEvent, game: NflGame): GameEnvironmentOdds | null {
  const markets = event.bookmakers?.[0]?.markets ?? [];
  const spread = markets.find((m) => m.key === 'spreads')?.outcomes.find((o) => TEAM_CODES[o.name] === game.home)?.point;
  const total = markets.find((m) => m.key === 'totals')?.outcomes.find((o) => o.name === 'Over')?.point;
  if (total === undefined) return null;
  const homeSpread = spread ?? 0;
  return {
    gameId: game.id,
    commenceTimeIso: event.commence_time,
    awayTeam: game.away,
    homeTeam: game.home,
    homeSpread,
    overUnderTotal: total,
    awayImpliedTotal: round2(total / 2 + homeSpread / 2),
    homeImpliedTotal: round2(total / 2 - homeSpread / 2),
    isDome: game.isDome
  };
}

/**
 * One event's player-prop markets → props keyed by Sleeper id. A player name
 * that matches more than one Sleeper player in this game is skipped, never
 * guessed.
 */
export function propsFromOddsApi(event: OddsApiEvent, game: NflGame, lookup: PlayerLookup): NormalizedPlayerProp[] {
  const book = event.bookmakers?.find((b) => b.key === BOOKMAKER) ?? event.bookmakers?.[0];
  if (!book) return [];
  const byPlayer = new Map<string, NormalizedPlayerProp>();
  const updated = Date.parse(book.last_update ?? '') || 0;

  const propFor = (name: string): NormalizedPlayerProp | null => {
    const p = lookup.byNameTeam(name, game.home) ?? lookup.byNameTeam(name, game.away);
    if (!p || (p.team !== game.home && p.team !== game.away)) return null;
    let prop = byPlayer.get(p.player_id);
    if (!prop) {
      const team = p.team;
      prop = emptyProp(p.player_id, game.id, team, team === game.home ? game.away : game.home);
      prop.updatedAtMs = updated;
      byPlayer.set(p.player_id, prop);
    }
    return prop;
  };

  for (const market of book.markets) {
    for (const o of market.outcomes) {
      if (!o.description) continue;
      const prop = propFor(o.description);
      if (!prop) continue;
      const over = o.name === 'Over' || o.name === 'Yes';
      const under = o.name === 'Under' || o.name === 'No';
      switch (market.key) {
        case 'player_pass_yds':
          if (over && o.point !== undefined) prop.passYdsLine = o.point;
          break;
        case 'player_pass_tds':
          if (o.point !== undefined) prop.passTdLine = o.point;
          if (over) prop.passTdOverOdds = o.price;
          if (under) prop.passTdUnderOdds = o.price;
          break;
        case 'player_pass_interceptions':
          if (o.point !== undefined) prop.passIntLine = o.point;
          if (over) prop.passIntOverOdds = o.price;
          if (under) prop.passIntUnderOdds = o.price;
          break;
        case 'player_rush_yds':
          if (over && o.point !== undefined) prop.rushYdsLine = o.point;
          break;
        case 'player_receptions':
          if (o.point !== undefined) prop.recLine = o.point;
          if (over) prop.recOverOdds = o.price;
          if (under) prop.recUnderOdds = o.price;
          break;
        case 'player_reception_yds':
          if (over && o.point !== undefined) prop.recYdsLine = o.point;
          break;
        case 'player_anytime_td':
          if (over) {
            prop.anytimeTdAmericanOdds = o.price;
            prop.anytimeTdFairProbability = anytimeTdFairProbability(o.price);
          }
          break;
        default:
          break;
      }
    }
  }
  return [...byPlayer.values()].filter(hasAnyLine);
}

/** ESPN game for an Odds API event, matched on the two teams. */
export function matchGame(event: OddsApiEvent, games: NflGame[]): NflGame | null {
  const home = TEAM_CODES[event.home_team];
  const away = TEAM_CODES[event.away_team];
  return games.find((g) => g.home === home && g.away === away) ?? null;
}

async function oddsApiJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`The Odds API returned ${res.status}`);
  return (await res.json()) as T;
}

/** The slate from The Odds API, for the ESPN week's games that haven't kicked off. */
export async function oddsApiSlate(
  key: string,
  games: NflGame[],
  lookup: PlayerLookup,
  fetcher: typeof fetch = fetch,
  onlyWithinMs: number | null = null
): Promise<VegasSlate> {
  const now = Date.now();
  const featured = await oddsApiJson<OddsApiEvent[]>(
    `${ODDS_API}/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=spreads,totals&oddsFormat=american&bookmakers=${BOOKMAKER}`,
    fetcher
  );
  const envs: GameEnvironmentOdds[] = [];
  const props: NormalizedPlayerProp[] = [];
  for (const event of featured) {
    const game = matchGame(event, games);
    if (!game) continue;
    const env = environmentFromOddsApi(event, game) ?? gameEnvironmentFromGame(game);
    if (env) envs.push(env);
    if (game.state !== 'pre') continue;
    if (onlyWithinMs !== null && game.kickoff - now > onlyWithinMs) continue;
    const detail = await oddsApiJson<OddsApiEvent>(
      `${ODDS_API}/events/${event.id}/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=${PROP_MARKETS}&oddsFormat=american&bookmakers=${BOOKMAKER}`,
      fetcher
    );
    props.push(...propsFromOddsApi(detail, game, lookup));
  }
  // Games The Odds API didn't list still get ESPN's line.
  for (const g of games) {
    if (!envs.some((e) => e.gameId === g.id)) {
      const env = gameEnvironmentFromGame(g);
      if (env) envs.push(env);
    }
  }
  return { games: envs, props, source: 'odds-api', fetchedAtMs: now };
}

/** Build the week's slate from the best available source. */
export async function buildSlate(env: Env, season: string, week: number, seasonType: SeasonType, fetcher: typeof fetch = fetch): Promise<VegasSlate> {
  const http = new HttpClient({ fetchImpl: fetcher });
  const sleeper = new SleeperClient(http);
  const espn = new LiveFeedClient(http);
  const lookup = buildPlayerLookup(await slimPlayersList(env, fetcher));

  if (env.ODDS_API_KEY) {
    try {
      const { games } = await espn.getWeek(season, week, seasonType);
      const slate = await oddsApiSlate(env.ODDS_API_KEY, games, lookup, fetcher);
      // Sleeper Picks fills prices The Odds API's book didn't post.
      const picks = parsePicksLines(await sleeper.getPicksLines().catch(() => []));
      const upcoming = games.filter((g) => g.state === 'pre');
      return { ...slate, props: mergeSleeperPicks(slate.props, picks, upcoming, (id) => lookup.byId(id)?.team ?? null) };
    } catch {
      // Quota spent or API down: fall back to the keyless slate.
    }
  }
  return new OddsClient({ http, sleeper, espn }).directSlate(season, week, seasonType, lookup);
}

/** Cached slate for a week, rebuilt after 15 minutes. */
export async function getSlate(env: Env, season: string, week: number, seasonType: SeasonType, fetcher: typeof fetch = fetch): Promise<VegasSlate> {
  const key = oddsKey(season, seasonType, week);
  const cached = await env.NIGHTOWL_KV.get<VegasSlate>(key, 'json');
  if (cached) return cached;
  const slate = await buildSlate(env, season, week, seasonType, fetcher);
  await env.NIGHTOWL_KV.put(key, JSON.stringify(slate), { expirationTtl: ODDS_TTL_SECONDS });
  return slate;
}
