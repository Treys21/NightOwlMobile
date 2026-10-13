export interface RawPlayStatDelta {
  playerId: string;
  espnAthleteId?: string;
  rawPlayerName?: string;
  teamAbbr?: string;

  passAtt?: number;
  passCmp?: number;
  passInc?: number;
  passYds?: number;
  passTd?: number;
  passInt?: number;
  pass2Pt?: number;
  passFirstDown?: number;
  passSack?: number;

  rushAtt?: number;
  rushYds?: number;
  rushTd?: number;
  rush2Pt?: number;
  rushFirstDown?: number;

  rec?: number;
  recYds?: number;
  recTd?: number;
  rec2Pt?: number;
  recFirstDown?: number;

  fum?: number;
  fumLost?: number;

  idpTklSolo?: number;
  idpTklAst?: number;
  idpTklLoss?: number;
  idpSack?: number;
  idpInt?: number;
  idpFf?: number;
  idpFr?: number;
  idpPassDef?: number;
  idpTd?: number;
}

/** Numeric stat fields of a RawPlayStatDelta. */
export type PlayStatKey = Exclude<keyof RawPlayStatDelta, 'playerId' | 'espnAthleteId' | 'rawPlayerName' | 'teamAbbr'>;

export interface CumulativeGameStats {
  passYds: number;
  rushYds: number;
  recYds: number;
}

export type ImpactPerspective = 'FOR_USER' | 'AGAINST_USER' | 'USER_BENCH' | 'CONFLICT_BOTH';

export interface LeaguePlayImpact {
  leagueId: string;
  leagueName: string;
  playerId: string;
  playerName: string;
  pointsDelta: number;
  perspective: ImpactPerspective;
  /** +pointsDelta for the user, −pointsDelta against, 0 on the bench or both sides. */
  netLeagueDelta: number;
  /** Opponent display name when the play hurts the user. */
  opponentName: string | null;
}

export interface EnrichedPlayEvent {
  playId: string;
  gameId: string;
  sequenceNumber: number;
  timestamp: number;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  quarter: number;
  clock: string;
  downAndDistance: string;
  isScoringPlay: boolean;
  /** Snap at or inside the opponent's 20. */
  isRedZonePlay: boolean;
  isStatCorrectionOrReversal: boolean;
  description: string;
  involvedPlayerIds: string[];
  statDeltas: RawPlayStatDelta[];
  leagueImpacts: LeaguePlayImpact[];
  /** Σ netLeagueDelta over the user's leagues. */
  totalNetPointsForUser: number;
  /** Same, times each league's weight. */
  weightedNetPointsForUser: number;
}

export type FeedFilterMode = 'ALL_ACTION' | 'MY_STARTERS' | 'OPPONENTS' | 'BIG_PLAYS';

/** A parsed ESPN play before league impacts are attached. */
export interface ParsedPlay {
  playId: string;
  gameId: string;
  sequenceNumber: number;
  timestamp: number;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  quarter: number;
  clock: string;
  downAndDistance: string;
  isScoringPlay: boolean;
  isRedZonePlay: boolean;
  description: string;
  statDeltas: RawPlayStatDelta[];
}
