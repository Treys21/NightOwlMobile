import { describe, expect, it } from 'vitest';
import { auditLineups, canFill } from '../engine/lineupAudit';
import { optimizeLineup } from '../engine/lineupOptimizer';
import type { SlimNflPlayer } from '../types/sleeper';
import { league, player, roster } from './fixtures';

const NOW = Date.parse('2026-10-18T16:00:00Z');
const LATER = NOW + 3600000;
const EARLIER = NOW - 3600000;

const players: Record<string, SlimNflPlayer> = Object.fromEntries(
  [
    player('qb', 'Josh Allen', 'QB', 'BUF'),
    player('rb1', 'James Cook', 'RB', 'BUF'),
    player('rb2', 'Out Back', 'RB', 'NYJ', { injury_status: 'Out' }),
    player('wr1', 'Bye Guy', 'WR', 'KC'),
    player('wr2', 'Q Receiver', 'WR', 'DAL', { injury_status: 'Questionable' }),
    player('te', 'Trey McBride', 'TE', 'ARI'),
    player('flex', 'Meh Flex', 'WR', 'MIA'),
    player('b_rb', 'Bench Back', 'RB', 'SF'),
    player('b_wr', 'Bench Star', 'WR', 'LAR'),
    player('b_hurt', 'Hurt Bench', 'WR', 'SEA', { injury_status: 'Out' }),
    player('b_locked', 'Early Game', 'WR', 'JAX'),
    player('locked_starter', 'Played Already', 'TE', 'HOU', { injury_status: 'Out' })
  ].map((p) => [p.player_id, p])
);

const kickoffs = new Map<string, number>([
  ['BUF', LATER], ['NYJ', LATER], ['DAL', LATER], ['ARI', LATER], ['MIA', LATER], ['SF', LATER],
  ['LAR', LATER], ['SEA', LATER], ['JAX', EARLIER], ['HOU', EARLIER]
]);

const implied: Record<string, number> = { qb: 22, rb1: 14, rb2: 0, wr1: 0, wr2: 9, te: 10, flex: 6.5, b_rb: 11, b_wr: 12.4, b_hurt: 15, b_locked: 20 };

const run = (bestBall = false, starters = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'te', 'flex']) =>
  auditLineups({
    leagues: [league('L', 'Main Dynasty', undefined, bestBall ? { best_ball: 1 } : {})],
    userRosters: { L: roster(1, 'me', starters, ['b_rb', 'b_wr', 'b_hurt', 'b_locked']) },
    playersMap: players,
    week: 7,
    teamsOnBye: new Set(['KC']),
    kickoffByTeam: kickoffs,
    now: NOW,
    impliedPoints: (pid) => implied[pid] ?? null
  });

describe('auditLineups', () => {
  it('flags Out starters and byes as critical with the best eligible swap', () => {
    const alerts = run();
    const out = alerts.find((a) => a.starterPlayer.player_id === 'rb2');
    expect(out).toMatchObject({ severity: 'CRITICAL', reason: 'Ruled Out', assignedSlot: 'RB', projectedPointGain: 11 });
    expect(out?.recommendedSwapPlayer?.player_id).toBe('b_rb');
    const bye = alerts.find((a) => a.starterPlayer.player_id === 'wr1');
    expect(bye).toMatchObject({ severity: 'CRITICAL', reason: 'On Week 7 bye' });
    // The hurt and the already-kicked-off bench players are never suggested.
    expect(bye?.recommendedSwapPlayer?.player_id).toBe('b_wr');
  });

  it('warns on Questionable starters', () => {
    const q = run().find((a) => a.starterPlayer.player_id === 'wr2');
    expect(q).toMatchObject({ severity: 'WARNING', reason: 'Questionable (game-time decision)', projectedPointGain: 3.4 });
  });

  it('suggests a Vegas upgrade when the bench out-projects a healthy starter by 1.5+', () => {
    const up = run().find((a) => a.severity === 'VEGAS_UPGRADE');
    expect(up).toMatchObject({ assignedSlot: 'FLEX', projectedPointGain: 5.9, reason: '+5.9 Vegas pts on your bench' });
    expect(up?.starterPlayer.player_id).toBe('flex');
    expect(up?.recommendedSwapPlayer?.player_id).toBe('b_wr');
    // The TE (10) has no eligible bench TE: no alert.
    expect(run().some((a) => a.starterPlayer.player_id === 'te')).toBe(false);
  });

  it('orders critical first and leaves locked starters alone', () => {
    const alerts = run(false, ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'locked_starter', 'flex']);
    expect(alerts.map((a) => a.severity)).toEqual(['CRITICAL', 'CRITICAL', 'WARNING', 'VEGAS_UPGRADE']);
    expect(alerts.some((a) => a.starterPlayer.player_id === 'locked_starter')).toBe(false);
  });

  it('skips best ball leagues', () => {
    expect(run(true)).toEqual([]);
  });

  it('checks slot eligibility', () => {
    expect(canFill('FLEX', players.te!)).toBe(true);
    expect(canFill('REC_FLEX', players.rb1!)).toBe(false);
    expect(canFill('SUPER_FLEX', players.qb!)).toBe(true);
  });
});

describe('optimizeLineup (ported Hungarian solver)', () => {
  const info = (pid: string) => {
    const p = players[pid]!;
    return { name: p.full_name, pos: p.position, team: p.team, positions: p.fantasy_positions, injury: p.injury_status };
  };
  const kickoffOf = (team: string | null) => (team && team !== 'KC' ? (kickoffs.get(team) ?? LATER) : null);

  it('finds the best lineup across flex chains and lists the moves', () => {
    const result = optimizeLineup(
      ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'],
      { starters: ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'te', 'flex'], players: ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'te', 'flex', 'b_rb', 'b_wr', 'b_hurt'], reserve: [], taxi: [] },
      info,
      (pid) => implied[pid] ?? 0,
      kickoffOf,
      NOW
    );
    // Best: swap Out RB for Bench Back (+11), bye WR for Bench Star (+12.4).
    expect(result.best.gain).toBe(23.4);
    expect(result.best.moves.filter((m) => m.type === 'start').map((m) => m.pid).sort()).toEqual(['b_rb', 'b_wr']);
    const rb2 = result.rows.find((r) => r.pid === 'rb2');
    expect(rb2?.notes[0]?.text).toBe('Out, likely scores zero');
    const byeRow = result.rows.find((r) => r.pid === 'wr1');
    expect(byeRow?.bye).toBe(true);
    expect(byeRow?.options[0]).toMatchObject({ pid: 'b_wr', gain: 12.4 });
  });
});
