// Draft grid coordinates for linear, snake and third-round-reversal drafts,
// the pick on the clock, and portfolio exposure for undrafted players.
import type {
  DraftBoardCellModel,
  DraftBoardModel,
  DraftExposureRow,
  DraftOrderType,
  SleeperDraft,
  SleeperDraftPick
} from '../types/draft';

export interface PickCoordinate {
  pickNo: number;
  round: number;
  pickInRound: number;
  columnIndex: number;
  draftSlot: number;
  isRightToLeft: boolean;
}

/** Does this round run right to left? */
export function isRightToLeft(round: number, type: DraftOrderType, reversalRound = 0): boolean {
  if (type === 'linear' || type === 'auction') return false;
  if (type === '3rr' || reversalRound === 3) {
    if (round === 1) return false;
    if (round === 2) return true;
    return round % 2 === 1;
  }
  return round % 2 === 0;
}

/** Overall pick (1-based) → round, column and slot. */
export function pickCoordinate(pickNo: number, teams: number, type: DraftOrderType, reversalRound = 0): PickCoordinate {
  const round = Math.floor((pickNo - 1) / teams) + 1;
  const offset = (pickNo - 1) % teams;
  const rtl = isRightToLeft(round, type, reversalRound);
  const columnIndex = rtl ? teams - 1 - offset : offset;
  return { pickNo, round, pickInRound: offset + 1, columnIndex, draftSlot: columnIndex + 1, isRightToLeft: rtl };
}

/** Slot this user drafts from, or null when they aren't in the draft. */
export function slotForUser(draft: SleeperDraft, userId: string | null): number | null {
  if (!userId || !draft.draft_order) return null;
  const slot = draft.draft_order[userId];
  return typeof slot === 'number' ? slot : null;
}

/** Slot on the clock for an overall pick. */
export function slotOnClock(draft: SleeperDraft, pickNo: number): number | null {
  const teams = draft.settings.teams;
  if (!teams) return null;
  return pickCoordinate(pickNo, teams, draft.type, draft.settings.reversal_round ?? 0).draftSlot;
}

/** "3.07" — round and pick in round. */
export const pickLabel = (round: number, pickInRound: number): string => `${round}.${String(pickInRound).padStart(2, '0')}`;

export function buildDraftBoard(draft: SleeperDraft, picks: SleeperDraftPick[], userId: string | null): DraftBoardModel {
  const teams = Math.max(1, draft.settings.teams);
  const rounds = Math.max(1, draft.settings.rounds);
  const reversal = draft.settings.reversal_round ?? 0;
  const byPickNo = new Map(picks.map((p) => [p.pick_no, p]));
  const userSlot = slotForUser(draft, userId);
  const total = teams * rounds;

  let onTheClock: number | null = null;
  if (draft.status === 'drafting' || draft.status === 'paused') {
    for (let n = 1; n <= total; n++) {
      if (!byPickNo.has(n)) {
        onTheClock = n;
        break;
      }
    }
  }

  const cells: DraftBoardCellModel[] = [];
  for (let n = 1; n <= total; n++) {
    const c = pickCoordinate(n, teams, draft.type, reversal);
    cells.push({
      pickNo: n,
      round: c.round,
      pickInRound: c.pickInRound,
      columnIndex: c.columnIndex,
      draftSlot: c.draftSlot,
      directionArrow: c.isRightToLeft ? 'LEFT' : 'RIGHT',
      pick: byPickNo.get(n) ?? null,
      isOnTheClock: n === onTheClock,
      isUserSlot: userSlot !== null && c.draftSlot === userSlot
    });
  }

  let picksUntilUser: number | null = null;
  if (onTheClock !== null && userSlot !== null) {
    const next = cells.find((cell) => cell.pickNo >= onTheClock && cell.isUserSlot && !cell.pick);
    if (next) picksUntilUser = next.pickNo - onTheClock;
  }

  return { teams, rounds, cells, onTheClockPickNo: onTheClock, userSlot, picksUntilUser };
}

/** Cells as rows of the grid (round by round, left to right on screen). */
export function boardRows(board: DraftBoardModel): DraftBoardCellModel[][] {
  const rows: DraftBoardCellModel[][] = [];
  for (let r = 1; r <= board.rounds; r++) {
    rows.push(board.cells.filter((c) => c.round === r).sort((a, b) => a.columnIndex - b.columnIndex));
  }
  return rows;
}

/**
 * Exposure for undrafted players: of the user's other leagues, in how many do
 * they already roster each player. `rosterSets` holds one Set of player ids
 * per other league.
 */
export function draftExposure(playerIds: string[], rosterSets: ReadonlyArray<ReadonlySet<string>>): DraftExposureRow[] {
  const counted = rosterSets.length;
  return playerIds.map((playerId) => {
    const owned = rosterSets.reduce((n, set) => n + (set.has(playerId) ? 1 : 0), 0);
    return { playerId, leaguesOwned: owned, leaguesCounted: counted, portfolioShare: counted ? owned / counted : 0 };
  });
}

/** Drafts worth showing in the war room: live first, then paused, then upcoming. */
export function activeDrafts(drafts: SleeperDraft[]): SleeperDraft[] {
  const rank: Record<string, number> = { drafting: 0, paused: 1, pre_draft: 2 };
  return drafts
    .filter((d) => d.status in rank)
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.start_time ?? 0) - (b.start_time ?? 0));
}
