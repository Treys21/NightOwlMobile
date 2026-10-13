export interface GameEnvironmentOdds {
  gameId: string;
  commenceTimeIso: string;
  awayTeam: string;
  homeTeam: string;
  /** Home team's spread, e.g. −3.5 when home is favored. */
  homeSpread: number;
  overUnderTotal: number;
  /** total / 2 + homeSpread / 2 */
  awayImpliedTotal: number;
  /** total / 2 − homeSpread / 2 */
  homeImpliedTotal: number;
  isDome: boolean;
}

export interface NormalizedPlayerProp {
  playerId: string;
  gameId: string;
  teamAbbr: string;
  opponentAbbr: string;
  passYdsLine: number | null;
  passTdLine: number | null;
  passTdOverOdds: number | null;
  passTdUnderOdds: number | null;
  passIntLine: number | null;
  passIntOverOdds: number | null;
  passIntUnderOdds: number | null;
  rushYdsLine: number | null;
  recLine: number | null;
  recOverOdds: number | null;
  recUnderOdds: number | null;
  recYdsLine: number | null;
  anytimeTdAmericanOdds: number | null;
  /** De-vigged chance of at least one TD, 0..1. */
  anytimeTdFairProbability: number;
  updatedAtMs: number;
}

export interface PlayerVegasProjection {
  playerId: string;
  leagueId: string;
  impliedFantasyPoints: number;
  breakdown: {
    passingPoints: number;
    rushingPoints: number;
    receivingPoints: number;
    touchdownPoints: number;
  };
  props: NormalizedPlayerProp;
  gameEnvironment: GameEnvironmentOdds | null;
}

/** What the BFF (or the direct fallback) returns for one NFL week. */
export interface VegasSlate {
  games: GameEnvironmentOdds[];
  props: NormalizedPlayerProp[];
  /** 'odds-api' via the BFF, 'espn' from the keyless fallback. */
  source: 'odds-api' | 'espn';
  fetchedAtMs: number;
}

/** A Sleeper Picks market, normalized (ported from the extension's Bets tool). */
export interface PicksMarket {
  type: string;
  label: string;
  keys: string[];
  td: boolean;
  max: boolean;
  line: number;
  over: number | null;
  under: number | null;
  /** De-vigged chance of the over. */
  pOver: number | null;
  recent: Array<{ date?: string; opponent?: string; value: number | null }>;
  gameId: string | null;
  updatedAt: number;
}
