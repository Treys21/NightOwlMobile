/**
 * Sleeper's draft `type` is 'snake', 'linear' or 'auction'; third-round
 * reversal is a snake draft with settings.reversal_round = 3. '3rr' is
 * accepted too so callers can ask for the layout directly.
 */
export type DraftOrderType = 'snake' | 'linear' | '3rr' | 'auction';

export type DraftStatus = 'pre_draft' | 'drafting' | 'paused' | 'complete';

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  status: DraftStatus;
  type: DraftOrderType;
  season: string;
  start_time?: number | null;
  last_picked?: number | null;
  settings: {
    teams: number;
    rounds: number;
    pick_timer: number;
    reversal_round?: number;
  };
  /** user_id → 1-indexed slot */
  draft_order: Record<string, number> | null;
  /** slot → roster_id */
  slot_to_roster_id: Record<string, number> | null;
  metadata?: {
    name?: string;
    scoring_type?: string;
  } | null;
}

export interface SleeperDraftPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  player_id: string;
  picked_by: string;
  roster_id: number | null;
  is_keeper: boolean | null;
  metadata: {
    first_name: string;
    last_name: string;
    position: string;
    team: string;
  };
}

export interface DraftBoardCellModel {
  pickNo: number;
  round: number;
  /** 1-indexed pick within the round. */
  pickInRound: number;
  /** 0 … teams−1, left to right. */
  columnIndex: number;
  /** 1 … teams */
  draftSlot: number;
  directionArrow: 'RIGHT' | 'LEFT';
  pick: SleeperDraftPick | null;
  isOnTheClock: boolean;
  isUserSlot: boolean;
}

export interface DraftBoardModel {
  teams: number;
  rounds: number;
  cells: DraftBoardCellModel[];
  /** Overall pick on the clock, or null when the draft isn't live. */
  onTheClockPickNo: number | null;
  userSlot: number | null;
  /** Picks until the user is up; 0 = on the clock now. */
  picksUntilUser: number | null;
}

export interface DraftExposureRow {
  playerId: string;
  /** Share of the user's other leagues where they roster this player, 0..1. */
  portfolioShare: number;
  leaguesOwned: number;
  leaguesCounted: number;
}
