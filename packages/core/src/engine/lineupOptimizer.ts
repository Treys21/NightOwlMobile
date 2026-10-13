// The best lineup for one league, solved exactly (ported from the Chrome
// extension). Every open slot against every unlocked, active player is an
// assignment problem, so flex chains — WR into WR, WR into FLEX, TE bumped
// out — are all weighed at once. Locked starters stay put.
import type { FantasyPosition, RosterSlotType, SleeperRoster } from '../types/sleeper';
import { SLOT_ELIGIBILITY } from './lineupAudit';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Statuses that mean "won't play"; Questionable is only a heads-up. */
export const OUT_STATUSES: ReadonlySet<string> = new Set(['Out', 'IR', 'PUP', 'Sus', 'NA', 'Doubtful']);

/** The best lineup has to beat the current one by this much to be suggested. */
export const MIN_GAIN = 1;

export const canPlay = (slot: RosterSlotType, positions: readonly FantasyPosition[]): boolean =>
  SLOT_ELIGIBILITY[slot].some((p) => positions.includes(p));

/**
 * Max-weight assignment of slots to players (Hungarian algorithm, O(n³)).
 * weight(slot, player, k) returns a number, or null when the player can't
 * fill that slot. Returns, per slot, the chosen player or null.
 */
export function assign<P>(slots: readonly RosterSlotType[], players: readonly P[], weight: (slot: RosterSlotType, player: P, k: number) => number | null): Array<P | null> {
  const n = slots.length;
  const m = Math.max(players.length, n) + n;
  const BIG = 1e6;
  const cost = (i: number, j: number): number => {
    if (j >= players.length) return j >= m - n ? BIG / 2 : BIG;
    const slot = slots[i];
    const player = players[j];
    if (slot === undefined || player === undefined) return BIG;
    const w = weight(slot, player, i);
    return w === null ? BIG : -w;
  };
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  const at = (arr: number[], i: number): number => arr[i] ?? 0;
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = at(p, j0);
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - at(u, i0) - at(v, j);
        if (cur < at(minv, j)) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (at(minv, j) < delta) {
          delta = at(minv, j);
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          const row = at(p, j);
          u[row] = at(u, row) + delta;
          v[j] = at(v, j) - delta;
        } else {
          minv[j] = at(minv, j) - delta;
        }
      }
      j0 = j1;
    } while (at(p, j0) !== 0);
    do {
      const j1 = at(way, j0);
      p[j0] = at(p, j1);
      j0 = j1;
    } while (j0);
  }
  const out = new Array<P | null>(n).fill(null);
  for (let j = 1; j <= m; j++) {
    const row = at(p, j);
    const player = players[j - 1];
    if (row && j - 1 < players.length && player !== undefined && cost(row - 1, j - 1) < BIG / 2) out[row - 1] = player;
  }
  return out;
}

export interface LineupPlayerInfo {
  name: string;
  pos: string;
  team: string | null;
  positions: FantasyPosition[];
  injury: string | null;
}

export type LineupStatus = 'start' | 'bench' | 'ir' | 'taxi';

export interface SwapOption {
  pid: string | null;
  name: string;
  proj: number;
  /** What the swap does to the lineup: + helps, − hurts. */
  gain: number;
  slot: RosterSlotType;
  via: { name: string; slot: RosterSlotType } | null;
}

export interface LineupRow {
  pid: string;
  name: string;
  pos: string;
  team: string | null;
  positions: FantasyPosition[];
  injury: string | null;
  kickoff: number | null;
  locked: boolean;
  bye: boolean;
  status: LineupStatus;
  slot: RosterSlotType | null;
  slotIndex: number | null;
  proj: number;
  notes: Array<{ kind: 'warn' | 'info' | 'swap'; text: string }>;
  inBest: boolean;
  options: SwapOption[];
}

export interface LineupMove {
  type: 'start' | 'move' | 'bench';
  name: string;
  pid: string;
  slot?: RosterSlotType;
}

export interface LineupResult {
  rows: LineupRow[];
  empty: RosterSlotType[];
  best: { gain: number; moves: LineupMove[] };
}

/**
 * One league → every rostered player with where they sit, what they project,
 * the best lineup's gain and every valid single swap.
 *   kickoffOf(team) → ms, or null when the team is on bye.
 */
export function optimizeLineup(
  slots: readonly RosterSlotType[],
  roster: Pick<SleeperRoster, 'starters' | 'players' | 'reserve' | 'taxi'>,
  info: (pid: string) => LineupPlayerInfo,
  projected: (pid: string) => number,
  kickoffOf: (team: string | null) => number | null,
  now: number
): LineupResult {
  const starters = roster.starters ?? [];
  const reserve = new Set(roster.reserve ?? []);
  const taxi = new Set(roster.taxi ?? []);
  const starting = new Map<string, number>();
  starters.forEach((pid, i) => {
    if (pid && pid !== '0') starting.set(pid, i);
  });

  const row = (pid: string): LineupRow => {
    const p = info(pid);
    const kickoff = kickoffOf(p.team);
    const slotIndex = starting.get(pid) ?? null;
    return {
      pid,
      name: p.name,
      pos: p.pos,
      team: p.team,
      positions: p.positions,
      injury: p.injury,
      kickoff,
      locked: kickoff !== null && kickoff <= now,
      bye: kickoff === null,
      status: slotIndex !== null ? 'start' : reserve.has(pid) ? 'ir' : taxi.has(pid) ? 'taxi' : 'bench',
      slot: slotIndex !== null ? (slots[slotIndex] ?? null) : null,
      slotIndex,
      proj: projected(pid),
      notes: [],
      inBest: false,
      options: []
    };
  };

  const rows = [...new Set([...(roster.players ?? []), ...starting.keys()])].map(row);
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const effective = (r: LineupRow): number => (r.bye || OUT_STATUSES.has(r.injury ?? '') ? 0 : r.proj);

  for (const r of rows) {
    if (r.status !== 'start' || r.locked) continue;
    if (r.bye) r.notes.push({ kind: 'warn', text: 'On bye, so this slot scores zero' });
    else if (OUT_STATUSES.has(r.injury ?? '')) r.notes.push({ kind: 'warn', text: `${r.injury}, likely scores zero` });
    else if (r.injury === 'Questionable') r.notes.push({ kind: 'info', text: 'Questionable: check before lock' });
  }

  const available = (r: LineupRow): boolean => !r.locked && !r.bye && !OUT_STATUSES.has(r.injury ?? '');
  const open = (i: number): boolean => {
    const s = byPid.get(starters[i] ?? '');
    return !s || !s.locked;
  };
  const slotAt = (i: number): RosterSlotType => slots[i] ?? 'BN';

  const openSlots = starters.map((_, i) => i).filter(open);
  const pool = rows.filter((r) => !r.locked && (r.status === 'start' || r.status === 'bench'));
  const best = assign(openSlots.map(slotAt), pool, (slot, r, k) => {
    if (!canPlay(slot, r.positions)) return null;
    return effective(r) + (r.slotIndex === openSlots[k] ? 1e-3 : 0);
  });
  const bestSlotOf = new Map<string, number>();
  best.forEach((r, k) => {
    const idx = openSlots[k];
    if (r && idx !== undefined) bestSlotOf.set(r.pid, idx);
  });
  const currentTotal = openSlots.reduce((t, i) => {
    const s = byPid.get(starters[i] ?? '');
    return t + (s ? effective(s) : 0);
  }, 0);
  const bestTotal = best.reduce((t, r) => t + (r ? effective(r) : 0), 0);
  const gain = round1(bestTotal - currentTotal);
  const moves: LineupMove[] = [];
  if (gain >= MIN_GAIN) {
    for (const r of pool) {
      const nowAt = r.status === 'start' ? r.slotIndex : null;
      const then = bestSlotOf.get(r.pid) ?? null;
      if (nowAt === then) continue;
      if (then === null) moves.push({ type: 'bench', name: r.name, pid: r.pid });
      else if (nowAt === null) moves.push({ type: 'start', name: r.name, pid: r.pid, slot: slotAt(then) });
      else moves.push({ type: 'move', name: r.name, pid: r.pid, slot: slotAt(then) });
    }
    const order = { start: 0, move: 1, bench: 2 };
    moves.sort((x, y) => order[x.type] - order[y.type]);
    for (const m of moves) {
      const r = byPid.get(m.pid);
      if (!r) continue;
      if (m.type === 'start') r.notes.push({ kind: 'swap', text: `Start at ${m.slot}: +${gain} for your lineup` });
      if (m.type === 'bench') r.notes.push({ kind: 'swap', text: `Bench: +${gain} for your lineup` });
      if (m.type === 'move') r.notes.push({ kind: 'info', text: `Slide to ${m.slot} in the best lineup` });
    }
  }
  for (const r of rows) r.inBest = bestSlotOf.has(r.pid) || (r.locked && r.status === 'start');

  const swapPath = (b: LineupRow, i: number): { slot: RosterSlotType; via: SwapOption['via'] } | null => {
    if (canPlay(slotAt(i), b.positions)) return { slot: slotAt(i), via: null };
    for (let j = 0; j < starters.length; j++) {
      if (j === i || !open(j)) continue;
      const t = byPid.get(starters[j] ?? '');
      if (t && canPlay(slotAt(j), b.positions) && canPlay(slotAt(i), t.positions)) {
        return { slot: slotAt(j), via: { name: t.name, slot: slotAt(i) } };
      }
    }
    return null;
  };
  for (const r of rows) {
    r.options = [];
    if (r.locked) continue;
    if (r.status === 'start' && r.slotIndex !== null) {
      const idx = r.slotIndex;
      for (const b of rows) {
        if (b.status !== 'bench' || !available(b)) continue;
        const path = swapPath(b, idx);
        if (path) r.options.push({ pid: b.pid, name: b.name, proj: b.proj, gain: round1(b.proj - effective(r)), slot: path.slot, via: path.via });
      }
    } else if (r.status === 'bench' && available(r)) {
      starters.forEach((pid, i) => {
        if (!open(i)) return;
        const s = byPid.get(pid);
        const path = swapPath(r, i);
        if (!path) return;
        const value = s ? effective(s) : 0;
        r.options.push({ pid: s ? s.pid : null, name: s ? s.name : `Empty ${slotAt(i)}`, proj: value, gain: round1(r.proj - value), slot: path.slot, via: path.via });
      });
    }
    r.options.sort((x, y) => y.gain - x.gain);
  }

  const empty = starters.map((pid, i) => (!pid || pid === '0' ? slotAt(i) : null)).filter((s): s is RosterSlotType => s !== null);
  return { rows, empty, best: { gain, moves } };
}
