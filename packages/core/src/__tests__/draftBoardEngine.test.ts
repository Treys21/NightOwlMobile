import { describe, expect, it } from 'vitest';
import {
  activeDrafts,
  boardRows,
  buildDraftBoard,
  draftExposure,
  pickCoordinate,
  pickLabel,
  slotOnClock
} from '../engine/draftBoardEngine';
import type { SleeperDraft, SleeperDraftPick } from '../types/draft';

const draft = (type: SleeperDraft['type'], extra: Partial<SleeperDraft> = {}, reversal = 0): SleeperDraft => ({
  draft_id: 'd',
  league_id: 'l',
  status: 'drafting',
  type,
  season: '2026',
  settings: { teams: 12, rounds: 4, pick_timer: 60, reversal_round: reversal },
  draft_order: { me: 5 },
  slot_to_roster_id: null,
  ...extra
});

const pick = (n: number, slot: number): SleeperDraftPick => ({
  pick_no: n,
  round: Math.ceil(n / 12),
  draft_slot: slot,
  player_id: `p${n}`,
  picked_by: `u${slot}`,
  roster_id: slot,
  is_keeper: null,
  metadata: { first_name: 'A', last_name: `Player${n}`, position: 'WR', team: 'KC' }
});

describe('pickCoordinate', () => {
  it('runs every round left to right in a linear draft', () => {
    expect(pickCoordinate(13, 12, 'linear')).toMatchObject({ round: 2, columnIndex: 0, draftSlot: 1, isRightToLeft: false });
    expect(pickCoordinate(24, 12, 'linear')).toMatchObject({ round: 2, columnIndex: 11 });
  });

  it('reverses even rounds in a snake draft', () => {
    expect(pickCoordinate(12, 12, 'snake')).toMatchObject({ round: 1, columnIndex: 11, draftSlot: 12 });
    expect(pickCoordinate(13, 12, 'snake')).toMatchObject({ round: 2, columnIndex: 11, draftSlot: 12, isRightToLeft: true });
    expect(pickCoordinate(25, 12, 'snake')).toMatchObject({ round: 3, columnIndex: 0, isRightToLeft: false });
  });

  it('keeps rounds 2 and 3 both right to left in a 3RR draft', () => {
    expect(pickCoordinate(13, 12, '3rr')).toMatchObject({ round: 2, columnIndex: 11 });
    expect(pickCoordinate(25, 12, '3rr')).toMatchObject({ round: 3, columnIndex: 11, isRightToLeft: true });
    expect(pickCoordinate(37, 12, '3rr')).toMatchObject({ round: 4, columnIndex: 0, isRightToLeft: false });
    expect(pickCoordinate(49, 12, '3rr')).toMatchObject({ round: 5, columnIndex: 11, isRightToLeft: true });
  });

  it("reads Sleeper's encoding of 3RR: a snake draft with reversal_round 3", () => {
    expect(pickCoordinate(25, 12, 'snake', 3)).toMatchObject({ columnIndex: 11 });
    expect(pickCoordinate(37, 12, 'snake', 3)).toMatchObject({ columnIndex: 0 });
    expect(slotOnClock(draft('snake', {}, 3), 26)).toBe(11);
  });

  it('labels picks as round.pick', () => {
    expect(pickLabel(3, 7)).toBe('3.07');
  });
});

describe('buildDraftBoard', () => {
  it('finds the pick on the clock, the user slot and picks until the user is up', () => {
    const board = buildDraftBoard(draft('snake'), [pick(1, 1), pick(2, 2)], 'me');
    expect(board.onTheClockPickNo).toBe(3);
    expect(board.userSlot).toBe(5);
    expect(board.picksUntilUser).toBe(2);
    const userCells = board.cells.filter((c) => c.isUserSlot).map((c) => c.pickNo);
    // Slot 5 picks 5th in round 1 and 8th (pick 20) in round 2.
    expect(userCells.slice(0, 2)).toEqual([5, 20]);
    expect(board.cells.find((c) => c.pickNo === 3)?.isOnTheClock).toBe(true);
    expect(board.cells.find((c) => c.pickNo === 13)?.directionArrow).toBe('LEFT');
  });

  it('has nobody on the clock before the draft starts', () => {
    const board = buildDraftBoard(draft('snake', { status: 'pre_draft' }), [], 'me');
    expect(board.onTheClockPickNo).toBeNull();
    expect(board.picksUntilUser).toBeNull();
  });

  it('lays rows out round by round in column order', () => {
    const rows = boardRows(buildDraftBoard(draft('snake'), [pick(13, 12)], null));
    expect(rows).toHaveLength(4);
    expect(rows[1]?.[11]?.pickNo).toBe(13);
    expect(rows[1]?.[11]?.pick?.player_id).toBe('p13');
  });
});

describe('draftExposure', () => {
  it('counts the share of other leagues that roster each player', () => {
    const rows = draftExposure(['a', 'b'], [new Set(['a', 'x']), new Set(['a']), new Set(['y'])]);
    expect(rows[0]).toMatchObject({ playerId: 'a', leaguesOwned: 2, leaguesCounted: 3 });
    expect(rows[0]?.portfolioShare).toBeCloseTo(2 / 3, 10);
    expect(rows[1]?.portfolioShare).toBe(0);
    expect(draftExposure(['a'], [])[0]?.portfolioShare).toBe(0);
  });
});

describe('activeDrafts', () => {
  it('lists live drafts first and drops finished ones', () => {
    const list = activeDrafts([
      draft('snake', { draft_id: 'done', status: 'complete' }),
      draft('snake', { draft_id: 'soon', status: 'pre_draft' }),
      draft('snake', { draft_id: 'live', status: 'drafting' })
    ]);
    expect(list.map((d) => d.draft_id)).toEqual(['live', 'soon']);
  });
});
