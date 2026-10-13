import type { RosterSlotType, ScoringSettings, SlimNflPlayer } from './sleeper';

export type UserSlotCategory = 'STARTER' | 'BENCH' | 'IR' | 'TAXI';

export interface LeagueExposureContext {
  leagueId: string;
  leagueName: string;
  leagueAvatar: string | null;
  isBestBall: boolean;
  scoringSettings: ScoringSettings;
  userRosterId: number;
  /** Null when the user doesn't roster the player in this league. */
  userSlotCategory: UserSlotCategory | null;
  /** 'RB', 'FLEX', 'SUPER_FLEX', 'BN' ... */
  userAssignedSlot: RosterSlotType | null;
  isOpponentStarter: boolean;
  opponentRosterId: number | null;
  opponentDisplayName: string | null;
  userMatchupPoints: number;
  opponentMatchupPoints: number;
  playerPointsInLeagueThisWeek: number;
  /** User-set league priority; 1.0 by default. */
  leagueWeight: number;
}

export interface PlayerPortfolioEntry {
  playerId: string;
  player: SlimNflPlayer;
  startedInLeagues: LeagueExposureContext[];
  benchedInLeagues: LeagueExposureContext[];
  irOrTaxiInLeagues: LeagueExposureContext[];
  facingInLeagues: LeagueExposureContext[];
  /** started − facing */
  netLeverageCount: number;
  /** Σ started weights − Σ facing weights */
  weightedLeverageScore: number;
  /** (started + benched + IR/taxi) / active leagues, 0..1 */
  ownershipShare: number;
  /** Started by the user somewhere and by an opponent somewhere. */
  isHighConflictPlayer: boolean;
}

export type InvertedRosterIndex = Record<string, PlayerPortfolioEntry>;

export interface LiveMatchupSummary {
  leagueId: string;
  leagueName: string;
  leagueAvatar: string | null;
  userRosterId: number;
  userTeamName: string;
  userPoints: number;
  opponentRosterId: number | null;
  opponentTeamName: string;
  opponentPoints: number;
  /** userPoints − opponentPoints */
  pointDifferential: number;
  isWinning: boolean;
  isTied: boolean;
}

export type LineupAlertSeverity = 'CRITICAL' | 'WARNING' | 'VEGAS_UPGRADE';

export interface LineupActionAlert {
  alertId: string;
  severity: LineupAlertSeverity;
  leagueId: string;
  leagueName: string;
  starterPlayer: SlimNflPlayer;
  assignedSlot: RosterSlotType;
  /** "Ruled Out", "On Week 7 bye", "Questionable (GTD)", "+3.2 Vegas pts on the bench" */
  reason: string;
  recommendedSwapPlayer: SlimNflPlayer | null;
  projectedPointGain: number | null;
}
