// Lineup health across leagues: starters who won't play (Out, IR, bye),
// game-time decisions, and bench players Vegas likes more than the starter.
import type { FantasyPosition, RosterSlotType, SleeperLeague, SleeperRoster, SlimNflPlayer } from '../types/sleeper';
import type { LineupActionAlert, LineupAlertSeverity } from '../types/index-engine';
import { isEmptySlot, startingSlots } from './invertedIndex';
import { unknownPlayer } from './playerNormalizer';
import { round2 } from './scoringEngine';

const ALL: FantasyPosition[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'];

export const SLOT_ELIGIBILITY: Record<RosterSlotType, FantasyPosition[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  K: ['K'],
  DEF: ['DEF'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  BN: ALL,
  IR: ALL,
  TAXI: ALL
};

/** Statuses that mean the starter scores zero. */
export const CRITICAL_STATUSES: ReadonlySet<string> = new Set(['Out', 'IR', 'Doubtful', 'PUP', 'Sus']);

/** The bench must out-project the starter by this much for a Vegas upgrade. */
export const VEGAS_UPGRADE_MIN_GAIN = 1.5;

export const canFill = (slot: RosterSlotType, player: SlimNflPlayer): boolean =>
  player.fantasy_positions.some((p) => SLOT_ELIGIBILITY[slot].includes(p));

export interface LineupAuditInput {
  leagues: SleeperLeague[];
  /** League id → the user's roster. */
  userRosters: Record<string, SleeperRoster>;
  /** League id → this week's starters, when the matchup is out (else roster.starters is used). */
  startersByLeague?: Record<string, string[]>;
  playersMap: Record<string, SlimNflPlayer>;
  week: number;
  teamsOnBye: ReadonlySet<string>;
  /** Team → kickoff ms. Locked teams (kicked off) are left alone. */
  kickoffByTeam: ReadonlyMap<string, number>;
  now: number;
  /** Vegas implied points for a player under a league's scoring, or null without a line. */
  impliedPoints: (playerId: string, leagueId: string) => number | null;
}

const severityRank: Record<LineupAlertSeverity, number> = { CRITICAL: 0, WARNING: 1, VEGAS_UPGRADE: 2 };

export function auditLineups(input: LineupAuditInput): LineupActionAlert[] {
  const { leagues, userRosters, playersMap, week, teamsOnBye, kickoffByTeam, now, impliedPoints } = input;
  const alerts: LineupActionAlert[] = [];
  const playerOf = (pid: string): SlimNflPlayer => playersMap[pid] ?? unknownPlayer(pid);
  const onBye = (p: SlimNflPlayer): boolean => !!p.team && teamsOnBye.has(p.team);
  const locked = (p: SlimNflPlayer): boolean => {
    const kickoff = p.team ? kickoffByTeam.get(p.team) : undefined;
    return kickoff !== undefined && kickoff <= now;
  };

  for (const league of leagues) {
    if (league.settings.best_ball === 1) continue;
    const roster = userRosters[league.league_id];
    if (!roster) continue;
    const slots = startingSlots(league);
    const starters = input.startersByLeague?.[league.league_id] ?? roster.starters ?? [];
    const starting = new Set(starters.filter((pid) => !isEmptySlot(pid)));
    const stashed = new Set([...(roster.reserve ?? []), ...(roster.taxi ?? [])]);
    const bench = (roster.players ?? [])
      .filter((pid) => !starting.has(pid) && !stashed.has(pid))
      .map(playerOf)
      .filter((p) => !onBye(p) && !locked(p) && !CRITICAL_STATUSES.has(p.injury_status ?? '') && p.injury_status !== 'Questionable');

    const bestSwap = (slot: RosterSlotType): { player: SlimNflPlayer; points: number } | null => {
      let best: { player: SlimNflPlayer; points: number } | null = null;
      for (const b of bench) {
        if (!canFill(slot, b)) continue;
        const pts = impliedPoints(b.player_id, league.league_id);
        if (pts === null) continue;
        if (!best || pts > best.points) best = { player: b, points: pts };
      }
      return best;
    };

    starters.forEach((pid, i) => {
      const slot = slots[i];
      if (!slot || isEmptySlot(pid)) return;
      const starter = playerOf(pid);
      if (locked(starter)) return;
      const status = starter.injury_status ?? '';
      const swap = bestSwap(slot);
      const starterPoints = impliedPoints(pid, league.league_id);

      let severity: LineupAlertSeverity | null = null;
      let reason = '';
      let gain: number | null = null;
      if (onBye(starter)) {
        severity = 'CRITICAL';
        reason = `On Week ${week} bye`;
        gain = swap ? round2(swap.points) : null;
      } else if (CRITICAL_STATUSES.has(status)) {
        severity = 'CRITICAL';
        reason = status === 'IR' ? 'On injured reserve' : status === 'Sus' ? 'Suspended' : status === 'PUP' ? 'On PUP list' : `Ruled ${status}`;
        gain = swap ? round2(swap.points) : null;
      } else if (status === 'Questionable') {
        severity = 'WARNING';
        reason = 'Questionable (game-time decision)';
        gain = swap && starterPoints !== null ? round2(swap.points - starterPoints) : null;
      } else if (swap && starterPoints !== null && swap.points - starterPoints >= VEGAS_UPGRADE_MIN_GAIN) {
        severity = 'VEGAS_UPGRADE';
        gain = round2(swap.points - starterPoints);
        reason = `+${gain.toFixed(1)} Vegas pts on your bench`;
      }
      if (!severity) return;

      alerts.push({
        alertId: `${league.league_id}:${week}:${pid}:${severity}`,
        severity,
        leagueId: league.league_id,
        leagueName: league.name.trim(),
        starterPlayer: starter,
        assignedSlot: slot,
        reason,
        recommendedSwapPlayer: swap?.player ?? null,
        projectedPointGain: gain
      });
    });
  }

  return alerts.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || (b.projectedPointGain ?? 0) - (a.projectedPointGain ?? 0)
  );
}
