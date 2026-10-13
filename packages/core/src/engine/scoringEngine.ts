// Fantasy points under one league's scoring.
//
// Two paths:
//  - calculatePlayFantasyPoints: one parsed play (RawPlayStatDelta), with
//    milestone bonuses checked against the player's running game totals.
//  - statLinePoints / statLineDelta: Sleeper's own stat lines (ported from
//    the Chrome extension). Those rows already carry derived keys such as
//    bonus_rec_yd_100 and pts_allow_14_20, so points are Σ stat × weight and
//    match what Sleeper shows in matchups exactly.
import type { ScoringSettings, SlimNflPlayer, StatLine } from '../types/sleeper';
import type { CumulativeGameStats, RawPlayStatDelta } from '../types/play-feed';

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function calculatePlayFantasyPoints(
  delta: RawPlayStatDelta,
  player: SlimNflPlayer,
  scoring: ScoringSettings,
  prevCumulative?: CumulativeGameStats,
  nextCumulative?: CumulativeGameStats
): number {
  let pts = 0;
  const s = (key: keyof ScoringSettings, fallback = 0): number => scoring[key] ?? fallback;

  // Passing
  pts += (delta.passYds ?? 0) * s('pass_yd', 0.04);
  pts += (delta.passTd ?? 0) * s('pass_td', 4);
  pts += (delta.passInt ?? 0) * s('pass_int', -1);
  pts += (delta.pass2Pt ?? 0) * s('pass_2pt', 2);
  pts += (delta.passCmp ?? 0) * s('pass_cmp', 0);
  pts += (delta.passInc ?? 0) * s('pass_inc', 0);
  pts += (delta.passAtt ?? 0) * s('pass_att', 0);
  pts += (delta.passFirstDown ?? 0) * s('pass_fd', 0);
  pts += (delta.passSack ?? 0) * s('pass_sack', 0);

  // Rushing
  pts += (delta.rushYds ?? 0) * s('rush_yd', 0.1);
  pts += (delta.rushTd ?? 0) * s('rush_td', 6);
  pts += (delta.rush2Pt ?? 0) * s('rush_2pt', 2);
  pts += (delta.rushAtt ?? 0) * s('rush_att', 0);
  pts += (delta.rushFirstDown ?? 0) * s('rush_fd', 0);

  // Receiving
  const recCount = delta.rec ?? 0;
  pts += recCount * s('rec', 0);
  pts += (delta.recYds ?? 0) * s('rec_yd', 0.1);
  pts += (delta.recTd ?? 0) * s('rec_td', 6);
  pts += (delta.rec2Pt ?? 0) * s('rec_2pt', 2);
  pts += (delta.recFirstDown ?? 0) * s('rec_fd', 0);

  // Position premiums (TE premium and friends)
  if (recCount > 0) {
    if (player.position === 'TE') pts += recCount * s('bonus_rec_te', 0);
    if (player.position === 'RB') pts += recCount * s('bonus_rec_rb', 0);
    if (player.position === 'WR') pts += recCount * s('bonus_rec_wr', 0);
  }

  // Tiered PPR by the yardage of a single catch
  if (recCount === 1 && delta.recYds !== undefined) {
    const yds = delta.recYds;
    if (yds >= 0 && yds <= 4) pts += s('rec_0_4', 0);
    else if (yds >= 5 && yds <= 9) pts += s('rec_5_9', 0);
    else if (yds >= 10 && yds <= 19) pts += s('rec_10_19', 0);
    else if (yds >= 20 && yds <= 29) pts += s('rec_20_29', 0);
    else if (yds >= 30 && yds <= 39) pts += s('rec_30_39', 0);
    else if (yds >= 40) pts += s('rec_40p_tiered', 0);
  }

  // Big-play bonuses
  if ((delta.passCmp ?? 0) > 0 && (delta.passYds ?? 0) >= 40) {
    pts += s('pass_cmp_40p', 0);
    if ((delta.passTd ?? 0) > 0) {
      pts += s('bonus_pass_td_40p', 0);
      if ((delta.passYds ?? 0) >= 50) pts += s('bonus_pass_td_50p', 0);
    }
  }
  if ((delta.rushAtt ?? 0) > 0 && (delta.rushYds ?? 0) >= 40) {
    pts += s('rush_40p', 0);
    if ((delta.rushTd ?? 0) > 0) {
      pts += s('bonus_rush_td_40p', 0);
      if ((delta.rushYds ?? 0) >= 50) pts += s('bonus_rush_td_50p', 0);
    }
  }
  if (recCount > 0 && (delta.recYds ?? 0) >= 40) {
    pts += s('rec_40p', 0);
    if ((delta.recTd ?? 0) > 0) {
      pts += s('bonus_rec_td_40p', 0);
      if ((delta.recYds ?? 0) >= 50) pts += s('bonus_rec_td_50p', 0);
    }
  }

  // Yardage milestones crossed on this play (and un-crossed by a correction)
  if (prevCumulative && nextCumulative) {
    const crossed = (prev: number, next: number, line: number): number => (prev < line && next >= line ? 1 : prev >= line && next < line ? -1 : 0);
    pts += crossed(prevCumulative.passYds, nextCumulative.passYds, 300) * s('bonus_pass_yd_300', 0);
    pts += crossed(prevCumulative.passYds, nextCumulative.passYds, 400) * s('bonus_pass_yd_400', 0);
    pts += crossed(prevCumulative.rushYds, nextCumulative.rushYds, 100) * s('bonus_rush_yd_100', 0);
    pts += crossed(prevCumulative.rushYds, nextCumulative.rushYds, 200) * s('bonus_rush_yd_200', 0);
    pts += crossed(prevCumulative.recYds, nextCumulative.recYds, 100) * s('bonus_rec_yd_100', 0);
    pts += crossed(prevCumulative.recYds, nextCumulative.recYds, 200) * s('bonus_rec_yd_200', 0);
  }

  // Fumbles and IDP
  pts += (delta.fum ?? 0) * s('fum', 0);
  pts += (delta.fumLost ?? 0) * s('fum_lost', -2);
  pts += (delta.idpTklSolo ?? 0) * (s('idp_tkl_solo', 0) || s('idp_tkl', 0));
  pts += (delta.idpTklAst ?? 0) * (s('idp_tkl_ast', 0) || s('idp_tkl', 0) * 0.5);
  pts += (delta.idpTklLoss ?? 0) * s('idp_tkl_loss', 0);
  pts += (delta.idpSack ?? 0) * s('idp_sack', 0);
  pts += (delta.idpInt ?? 0) * s('idp_int', 0);
  pts += (delta.idpFf ?? 0) * s('idp_ff', 0);
  pts += (delta.idpFr ?? 0) * s('idp_fr', 0);
  pts += (delta.idpPassDef ?? 0) * s('idp_pass_def', 0);
  pts += (delta.idpTd ?? 0) * s('idp_td', 0);

  return round2(pts);
}

/** Running yardage after a play: what milestone bonuses are checked against. */
export function addToCumulative(prev: CumulativeGameStats, delta: RawPlayStatDelta): CumulativeGameStats {
  return {
    passYds: prev.passYds + (delta.passYds ?? 0),
    rushYds: prev.rushYds + (delta.rushYds ?? 0),
    recYds: prev.recYds + (delta.recYds ?? 0)
  };
}

export const EMPTY_CUMULATIVE: CumulativeGameStats = { passYds: 0, rushYds: 0, recYds: 0 };

/** Σ stats[key] × scoring[key] — Sleeper's own number for a stat line. */
export function statLinePoints(stats: StatLine | null | undefined, scoring: ScoringSettings): number {
  if (!stats) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(stats)) {
    const weight = scoring[key];
    if (weight) total += value * weight;
  }
  return round2(total);
}

/** Keys whose value changed between two stat lines → { key: change }. */
export function statLineDelta(prev: StatLine | null | undefined, cur: StatLine | null | undefined): StatLine {
  const out: StatLine = {};
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(cur ?? {})]);
  for (const key of keys) {
    const change = round2((cur?.[key] ?? 0) - (prev?.[key] ?? 0));
    if (change !== 0) out[key] = change;
  }
  return out;
}

/** Scoring label for onboarding chips: PPR, Half-PPR, TEP, Superflex, Best Ball. */
export function scoringTags(scoring: ScoringSettings, rosterPositions: readonly string[], bestBall: boolean): string[] {
  const tags: string[] = [];
  const rec = scoring.rec ?? 0;
  tags.push(rec >= 1 ? 'PPR' : rec >= 0.5 ? 'Half-PPR' : rec > 0 ? `${rec} PPR` : 'Standard');
  if ((scoring.bonus_rec_te ?? 0) > 0) tags.push('TEP');
  if (rosterPositions.includes('SUPER_FLEX') || rosterPositions.filter((p) => p === 'QB').length > 1) tags.push('Superflex');
  if (rosterPositions.some((p) => p === 'DL' || p === 'LB' || p === 'DB' || p === 'IDP_FLEX')) tags.push('IDP');
  if (bestBall) tags.push('Best Ball');
  return tags;
}
