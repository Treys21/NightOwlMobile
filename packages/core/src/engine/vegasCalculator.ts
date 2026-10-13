// Sportsbook prices → fair probabilities → expected stat lines → fantasy
// points under a league's own scoring.
import type { ScoringSettings, SlimNflPlayer } from '../types/sleeper';
import type { GameEnvironmentOdds, NormalizedPlayerProp, PicksMarket, PlayerVegasProjection } from '../types/vegas';
import type { NflGame } from '../types/espn';
import { round2 } from './scoringEngine';

/** American odds → raw implied probability (vig included). */
export function americanToRawProb(odds: number): number {
  if (odds === 0) return 0;
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** Decimal payout (2.34 returns $2.34 per $1) → American odds (+134); null for ≤ 1. */
export function decimalToAmerican(decimal: number | null | undefined): number | null {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 1) return null;
  return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1));
}

/** "+134" / "-244" for display. */
export const formatAmerican = (odds: number | null): string => (odds === null ? '—' : odds > 0 ? `+${odds}` : `${odds}`);

/** Two-way market, multiplicative de-vig: the fair chance of the over. */
export function devigTwoWay(overOdds: number, underOdds: number): number {
  const pOver = americanToRawProb(overOdds);
  const pUnder = americanToRawProb(underOdds);
  const totalBook = pOver + pUnder;
  return totalBook > 0 ? pOver / totalBook : 0;
}

/** One-way anytime-TD price → expected touchdowns (Poisson λ after stripping ~6% hold). */
export function expectedTouchdownsFromAnytimeOdds(anytimeOdds: number | null): number {
  if (anytimeOdds === null) return 0;
  const rawProb = americanToRawProb(anytimeOdds);
  const fairProbAtLeastOne = Math.min(0.88, rawProb * 0.94);
  const lambda = -Math.log(1 - fairProbAtLeastOne);
  return Math.round(lambda * 1000) / 1000;
}

/** Fair P(≥1 TD) from a one-way price, same hold assumption. */
export function anytimeTdFairProbability(anytimeOdds: number | null): number {
  if (anytimeOdds === null) return 0;
  return Math.round(Math.min(0.88, americanToRawProb(anytimeOdds) * 0.94) * 10000) / 10000;
}

/** Expected count for a discrete line L with fair over chance p: ⌊L⌋ + p × 1.15. */
export const expectedCountFromLine = (line: number, pOver: number): number => Math.floor(line) + pOver * 1.15;

/** Reception rate for this player: rec plus any position premium. */
export function receptionRate(player: SlimNflPlayer, scoring: ScoringSettings): number {
  return (
    (scoring.rec ?? 0) +
    (player.position === 'TE' ? (scoring.bonus_rec_te ?? 0) : 0) +
    (player.position === 'RB' ? (scoring.bonus_rec_rb ?? 0) : 0) +
    (player.position === 'WR' ? (scoring.bonus_rec_wr ?? 0) : 0)
  );
}

export function computeImpliedFantasyPoints(
  prop: NormalizedPlayerProp,
  player: SlimNflPlayer,
  scoring: ScoringSettings,
  leagueId = '',
  gameEnvironment: GameEnvironmentOdds | null = null
): PlayerVegasProjection {
  const passYds = prop.passYdsLine ?? 0;
  const expectedPassTds =
    prop.passTdLine !== null && prop.passTdOverOdds !== null && prop.passTdUnderOdds !== null
      ? expectedCountFromLine(prop.passTdLine, devigTwoWay(prop.passTdOverOdds, prop.passTdUnderOdds))
      : (prop.passTdLine ?? 0);
  const expectedInts =
    prop.passIntLine !== null && prop.passIntOverOdds !== null && prop.passIntUnderOdds !== null
      ? devigTwoWay(prop.passIntOverOdds, prop.passIntUnderOdds)
      : (prop.passIntLine ?? 0);

  const rushYds = prop.rushYdsLine ?? 0;
  const recCount =
    prop.recLine !== null && prop.recOverOdds !== null && prop.recUnderOdds !== null
      ? Math.floor(prop.recLine) + devigTwoWay(prop.recOverOdds, prop.recUnderOdds)
      : (prop.recLine ?? 0);
  const recYds = prop.recYdsLine ?? 0;
  const expectedNonPassTds =
    prop.anytimeTdAmericanOdds !== null
      ? expectedTouchdownsFromAnytimeOdds(prop.anytimeTdAmericanOdds)
      : prop.anytimeTdFairProbability > 0
        ? Math.round(-Math.log(1 - Math.min(0.88, prop.anytimeTdFairProbability)) * 1000) / 1000
        : 0;

  const passingPoints =
    passYds * (scoring.pass_yd ?? 0.04) + expectedPassTds * (scoring.pass_td ?? 4) + expectedInts * (scoring.pass_int ?? -1);
  const rushingPoints = rushYds * (scoring.rush_yd ?? 0.1);
  const receivingPoints = recCount * receptionRate(player, scoring) + recYds * (scoring.rec_yd ?? 0.1);
  const tdPoints = expectedNonPassTds * (scoring.rush_td ?? scoring.rec_td ?? 6);

  return {
    playerId: player.player_id,
    leagueId,
    impliedFantasyPoints: round2(passingPoints + rushingPoints + receivingPoints + tdPoints),
    breakdown: {
      passingPoints: round2(passingPoints),
      rushingPoints: round2(rushingPoints),
      receivingPoints: round2(receivingPoints),
      touchdownPoints: round2(tdPoints)
    },
    props: prop,
    gameEnvironment
  };
}

/** A prop with only the ids filled in, for merging lines from several books. */
export function emptyProp(playerId: string, gameId: string, teamAbbr: string, opponentAbbr: string): NormalizedPlayerProp {
  return {
    playerId,
    gameId,
    teamAbbr,
    opponentAbbr,
    passYdsLine: null,
    passTdLine: null,
    passTdOverOdds: null,
    passTdUnderOdds: null,
    passIntLine: null,
    passIntOverOdds: null,
    passIntUnderOdds: null,
    rushYdsLine: null,
    recLine: null,
    recOverOdds: null,
    recUnderOdds: null,
    recYdsLine: null,
    anytimeTdAmericanOdds: null,
    anytimeTdFairProbability: 0,
    updatedAtMs: 0
  };
}

/** Does this prop carry anything a projection can use? */
export const hasAnyLine = (p: NormalizedPlayerProp): boolean =>
  p.passYdsLine !== null ||
  p.passTdLine !== null ||
  p.rushYdsLine !== null ||
  p.recLine !== null ||
  p.recYdsLine !== null ||
  p.anytimeTdAmericanOdds !== null ||
  p.anytimeTdFairProbability > 0;

/** Spread string ("JAX -7.5", "EVEN", "PK") + total → environment for a game. */
export function gameEnvironmentFromGame(game: NflGame): GameEnvironmentOdds | null {
  const total = game.odds?.overUnder;
  if (total === null || total === undefined || !Number.isFinite(total)) return null;
  const details = (game.odds?.details ?? '').trim();
  let homeSpread = 0;
  const m = /^([A-Z]{2,4})\s+(-?\d+(?:\.\d+)?)$/.exec(details);
  if (m) {
    const favorite = m[1] === 'WSH' ? 'WAS' : m[1] === 'LA' ? 'LAR' : (m[1] ?? '');
    const spread = Math.abs(Number(m[2]));
    homeSpread = favorite === game.home ? -spread : spread;
  }
  return {
    gameId: game.id,
    commenceTimeIso: new Date(game.kickoff).toISOString(),
    awayTeam: game.away,
    homeTeam: game.home,
    homeSpread,
    overUnderTotal: total,
    awayImpliedTotal: round2(total / 2 + homeSpread / 2),
    homeImpliedTotal: round2(total / 2 - homeSpread / 2),
    isDome: game.isDome
  };
}

/** Implied points for one team in a game environment. */
export function impliedTeamTotal(env: GameEnvironmentOdds, team: string): number | null {
  if (team === env.homeTeam) return env.homeImpliedTotal;
  if (team === env.awayTeam) return env.awayImpliedTotal;
  return null;
}

/**
 * Fold Sleeper Picks markets (which price both sides) into a prop: lines the
 * book didn't post are filled, and over/under payouts become American odds
 * so the de-vig math above can use them.
 */
export function mergePicksIntoProp(prop: NormalizedPlayerProp, markets: PicksMarket[]): NormalizedPlayerProp {
  const out = { ...prop };
  for (const m of markets) {
    const over = decimalToAmerican(m.over);
    const under = decimalToAmerican(m.under);
    switch (m.type) {
      case 'passing_yards':
        out.passYdsLine ??= m.line;
        break;
      case 'passing_touchdowns':
        out.passTdLine ??= m.line;
        out.passTdOverOdds ??= over;
        out.passTdUnderOdds ??= under;
        break;
      case 'interceptions':
        out.passIntLine ??= m.line;
        out.passIntOverOdds ??= over;
        out.passIntUnderOdds ??= under;
        break;
      case 'rushing_yards':
        out.rushYdsLine ??= m.line;
        break;
      case 'receptions':
        out.recLine ??= m.line;
        out.recOverOdds ??= over;
        out.recUnderOdds ??= under;
        break;
      case 'receiving_yards':
        out.recYdsLine ??= m.line;
        break;
      case 'anytime_touchdowns':
        if (out.anytimeTdAmericanOdds === null && m.pOver !== null) {
          out.anytimeTdFairProbability = Math.round(m.pOver * 10000) / 10000;
        }
        break;
      default:
        break;
    }
    out.updatedAtMs = Math.max(out.updatedAtMs, m.updatedAt);
  }
  return out;
}
