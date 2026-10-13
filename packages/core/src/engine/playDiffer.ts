// Stateful play de-duplication across polls, stat-correction detection, and
// enrichment with per-league fantasy impact.
//
// Each poll re-reads a game's whole play list. A play id seen before with the
// same stats is skipped; one whose stats changed (a spot moved, a catch ruled
// incomplete on review) emits a correction carrying only the difference; one
// that vanished emits its stats negated. Running yardage per player is kept
// so 100/300-yard bonuses land on the play that crossed the line.
import type {
  CumulativeGameStats,
  EnrichedPlayEvent,
  ImpactPerspective,
  LeaguePlayImpact,
  ParsedPlay,
  PlayStatKey,
  RawPlayStatDelta
} from '../types/play-feed';
import type { InvertedRosterIndex, LeagueExposureContext } from '../types/index-engine';
import type { SlimNflPlayer } from '../types/sleeper';
import { EMPTY_CUMULATIVE, addToCumulative, calculatePlayFantasyPoints, round2 } from './scoringEngine';

const STAT_KEYS: PlayStatKey[] = [
  'passAtt', 'passCmp', 'passInc', 'passYds', 'passTd', 'passInt', 'pass2Pt', 'passFirstDown', 'passSack',
  'rushAtt', 'rushYds', 'rushTd', 'rush2Pt', 'rushFirstDown',
  'rec', 'recYds', 'recTd', 'rec2Pt', 'recFirstDown',
  'fum', 'fumLost',
  'idpTklSolo', 'idpTklAst', 'idpTklLoss', 'idpSack', 'idpInt', 'idpFf', 'idpFr', 'idpPassDef', 'idpTd'
];

export interface DeltaWithContext {
  delta: RawPlayStatDelta;
  prevCumulative: CumulativeGameStats;
  nextCumulative: CumulativeGameStats;
}

export interface DiffedPlay {
  play: ParsedPlay;
  deltas: DeltaWithContext[];
  isCorrection: boolean;
}

export interface DiffResult {
  /** First time this game was seen: the plays are history, not news. */
  baseline: boolean;
  plays: DiffedPlay[];
}

const fingerprint = (deltas: RawPlayStatDelta[]): string =>
  deltas
    .map((d) => `${d.playerId}:${STAT_KEYS.map((k) => d[k] ?? 0).join(',')}`)
    .sort()
    .join('|');

/** new − old, per player; players whose stats didn't move drop out. */
export function subtractDeltas(next: RawPlayStatDelta[], prev: RawPlayStatDelta[]): RawPlayStatDelta[] {
  const out = new Map<string, RawPlayStatDelta>();
  const apply = (d: RawPlayStatDelta, sign: number): void => {
    let cur = out.get(d.playerId);
    if (!cur) {
      cur = { playerId: d.playerId };
      if (d.rawPlayerName) cur.rawPlayerName = d.rawPlayerName;
      if (d.teamAbbr) cur.teamAbbr = d.teamAbbr;
      if (d.espnAthleteId) cur.espnAthleteId = d.espnAthleteId;
      out.set(d.playerId, cur);
    }
    for (const k of STAT_KEYS) {
      const v = d[k];
      if (v) cur[k] = round2((cur[k] ?? 0) + sign * v);
    }
  };
  for (const d of next) apply(d, 1);
  for (const d of prev) apply(d, -1);
  return [...out.values()]
    .map((d) => {
      for (const k of STAT_KEYS) if (d[k] === 0) delete d[k];
      return d;
    })
    .filter((d) => STAT_KEYS.some((k) => d[k] !== undefined));
}

interface GameState {
  plays: Map<string, { play: ParsedPlay; fp: string }>;
  totals: Map<string, CumulativeGameStats>;
}

export class PlayDiffer {
  private readonly games = new Map<string, GameState>();

  /** Feed the full, current play list for one game. */
  ingest(gameId: string, plays: ParsedPlay[]): DiffResult {
    let state = this.games.get(gameId);
    const baseline = !state;
    if (!state) {
      state = { plays: new Map(), totals: new Map() };
      this.games.set(gameId, state);
    }
    const out: DiffedPlay[] = [];
    const totals = state.totals;
    const withContext = (deltas: RawPlayStatDelta[]): DeltaWithContext[] =>
      deltas.map((delta) => {
        const prevCumulative = totals.get(delta.playerId) ?? EMPTY_CUMULATIVE;
        const nextCumulative = addToCumulative(prevCumulative, delta);
        totals.set(delta.playerId, nextCumulative);
        return { delta, prevCumulative, nextCumulative };
      });

    const current = new Map(plays.map((p) => [p.playId, p]));

    // Corrections and reversals first, against the totals as they stood.
    for (const [id, seen] of state.plays) {
      const now = current.get(id);
      if (now) {
        const fp = fingerprint(now.statDeltas);
        if (fp === seen.fp) continue;
        const diff = subtractDeltas(now.statDeltas, seen.play.statDeltas);
        state.plays.set(id, { play: now, fp });
        if (diff.length) out.push({ play: { ...now, statDeltas: diff }, deltas: withContext(diff), isCorrection: true });
      } else {
        state.plays.delete(id);
        const diff = subtractDeltas([], seen.play.statDeltas);
        if (diff.length) {
          out.push({
            play: { ...seen.play, statDeltas: diff, description: `Reversed: ${seen.play.description}` },
            deltas: withContext(diff),
            isCorrection: true
          });
        }
      }
    }

    // New plays in game order.
    for (const play of [...plays].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
      if (state.plays.has(play.playId)) continue;
      state.plays.set(play.playId, { play, fp: fingerprint(play.statDeltas) });
      out.push({ play, deltas: withContext(play.statDeltas), isCorrection: false });
    }

    return { baseline, plays: out };
  }

  /** Running yardage for a player in a game. */
  cumulative(gameId: string, playerId: string): CumulativeGameStats {
    return this.games.get(gameId)?.totals.get(playerId) ?? EMPTY_CUMULATIVE;
  }

  /** Forget games no longer on the slate (a new week). */
  retain(gameIds: Iterable<string>): void {
    const keep = new Set(gameIds);
    for (const id of [...this.games.keys()]) if (!keep.has(id)) this.games.delete(id);
  }
}

/**
 * Attach per-league impact. For each player on the play: leagues where the
 * user starts him count for, leagues where this week's opponent starts him
 * count against, and the bench or both-sides cases net zero.
 */
export function enrichPlay(
  diffed: DiffedPlay,
  index: InvertedRosterIndex,
  playerOf: (id: string) => SlimNflPlayer | null
): EnrichedPlayEvent {
  const impacts: LeaguePlayImpact[] = [];
  const involved = new Set<string>();

  for (const { delta, prevCumulative, nextCumulative } of diffed.deltas) {
    involved.add(delta.playerId);
    const entry = index[delta.playerId];
    const player = entry?.player ?? playerOf(delta.playerId);
    if (!entry || !player) continue;

    const push = (ctx: LeagueExposureContext, perspective: ImpactPerspective): void => {
      const pts = calculatePlayFantasyPoints(delta, player, ctx.scoringSettings, prevCumulative, nextCumulative);
      if (pts === 0) return;
      const net = perspective === 'FOR_USER' ? pts : perspective === 'AGAINST_USER' ? -pts : 0;
      impacts.push({
        leagueId: ctx.leagueId,
        leagueName: ctx.leagueName,
        playerId: delta.playerId,
        playerName: player.full_name,
        pointsDelta: pts,
        perspective,
        netLeagueDelta: net,
        opponentName: perspective === 'AGAINST_USER' ? ctx.opponentDisplayName : null
      });
    };

    const bothSides = new Set<string>();
    for (const ctx of entry.startedInLeagues) {
      if (ctx.isOpponentStarter) {
        bothSides.add(ctx.leagueId);
        push(ctx, 'CONFLICT_BOTH');
      } else {
        push(ctx, 'FOR_USER');
      }
    }
    for (const ctx of entry.facingInLeagues) if (!bothSides.has(ctx.leagueId)) push(ctx, 'AGAINST_USER');
    for (const ctx of entry.benchedInLeagues) push(ctx, 'USER_BENCH');
  }

  const weightOf = new Map<string, number>();
  for (const id of involved) {
    const entry = index[id];
    if (!entry) continue;
    for (const ctx of [...entry.startedInLeagues, ...entry.facingInLeagues, ...entry.benchedInLeagues]) weightOf.set(ctx.leagueId, ctx.leagueWeight);
  }

  const p = diffed.play;
  return {
    playId: diffed.isCorrection ? `${p.playId}:fix:${fingerprint(p.statDeltas)}` : p.playId,
    gameId: p.gameId,
    sequenceNumber: p.sequenceNumber,
    timestamp: p.timestamp,
    awayTeam: p.awayTeam,
    homeTeam: p.homeTeam,
    awayScore: p.awayScore,
    homeScore: p.homeScore,
    quarter: p.quarter,
    clock: p.clock,
    downAndDistance: p.downAndDistance,
    isScoringPlay: p.isScoringPlay,
    isRedZonePlay: p.isRedZonePlay,
    isStatCorrectionOrReversal: diffed.isCorrection,
    description: p.description,
    involvedPlayerIds: [...involved],
    statDeltas: p.statDeltas,
    leagueImpacts: impacts.sort((a, b) => Math.abs(b.netLeagueDelta) - Math.abs(a.netLeagueDelta)),
    totalNetPointsForUser: round2(impacts.reduce((t, i) => t + i.netLeagueDelta, 0)),
    weightedNetPointsForUser: round2(impacts.reduce((t, i) => t + i.netLeagueDelta * (weightOf.get(i.leagueId) ?? 1), 0))
  };
}

/** Does a play touch the user's leagues at all (worth a feed row)? */
export const touchesPortfolio = (e: EnrichedPlayEvent): boolean => e.leagueImpacts.length > 0;

/** |net| at or above this, or any score, is a big play. */
export const BIG_PLAY_POINTS = 3;
/** A play this good for the user earns a success haptic. */
export const HAPTIC_PLAY_POINTS = 6;

/** The feed's segmented filter, optionally narrowed to one league. */
export function filterFeed(events: EnrichedPlayEvent[], mode: import('../types/play-feed').FeedFilterMode, leagueId: string | null = null): EnrichedPlayEvent[] {
  return events.filter((e) => {
    if (leagueId && !e.leagueImpacts.some((i) => i.leagueId === leagueId)) return false;
    switch (mode) {
      case 'MY_STARTERS':
        return e.leagueImpacts.some((i) => i.perspective === 'FOR_USER');
      case 'OPPONENTS':
        return e.leagueImpacts.some((i) => i.perspective === 'AGAINST_USER');
      case 'BIG_PLAYS':
        return Math.abs(e.totalNetPointsForUser) >= BIG_PLAY_POINTS || e.isScoringPlay;
      case 'ALL_ACTION':
        return e.leagueImpacts.some((i) => i.perspective !== 'USER_BENCH');
    }
  });
}
