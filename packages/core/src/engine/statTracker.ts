// Sleeper live stat-line diffing, ported from the Chrome extension's tracker.
// Every poll of api.sleeper.com/stats is compared with the last; a watched
// player whose fantasy points moved becomes an event with exact per-league
// impact (Sleeper's rows already include every bonus key). The iOS feed uses
// it for kickers and team defenses, which ESPN play text can't score.
import type { ScoringSettings, StatLine } from '../types/sleeper';
import type { InvertedRosterIndex } from '../types/index-engine';
import { round2, statLineDelta, statLinePoints } from './scoringEngine';

const LABELS: Array<[string, string]> = [
  ['pass_cmp', 'cmp'], ['pass_yd', 'pass yds'], ['pass_td', 'pass TD'], ['pass_int', 'INT thrown'],
  ['pass_2pt', '2-pt pass'], ['pass_sack', 'sacked'],
  ['rush_att', 'rush'], ['rush_yd', 'rush yds'], ['rush_td', 'rush TD'], ['rush_2pt', '2-pt rush'],
  ['rec', 'rec'], ['rec_yd', 'rec yds'], ['rec_td', 'rec TD'], ['rec_2pt', '2-pt rec'],
  ['rush_fd', 'rush 1st down'], ['rec_fd', 'rec 1st down'], ['pass_fd', 'pass 1st down'],
  ['fum_lost', 'fumble lost'], ['fum', 'fumble'],
  ['kr_yd', 'KR yds'], ['pr_yd', 'PR yds'], ['st_td', 'ST TD'],
  ['fgm_0_19', 'FG 0-19'], ['fgm_20_29', 'FG 20-29'], ['fgm_30_39', 'FG 30-39'],
  ['fgm_40_49', 'FG 40-49'], ['fgm_50_59', 'FG 50-59'], ['fgm_60p', 'FG 60+'],
  ['fgmiss', 'FG miss'], ['xpm', 'XP'], ['xpmiss', 'XP miss'],
  ['sack', 'sack'], ['int', 'INT'], ['fum_rec', 'fum rec'], ['ff', 'forced fum'],
  ['def_td', 'DEF TD'], ['def_st_td', 'ST TD'], ['safe', 'safety'], ['blk_kick', 'blocked kick'],
  ['pts_allow', 'pts allowed'], ['yds_allow', 'yds allowed'],
  ['idp_tkl_solo', 'solo tkl'], ['idp_tkl_ast', 'ast tkl'], ['idp_sack', 'sack'],
  ['idp_int', 'INT'], ['idp_ff', 'forced fum'], ['idp_fum_rec', 'fum rec'], ['idp_pass_def', 'PD'],
  ['idp_td', 'TD']
];
const LABEL = new Map(LABELS);
const ORDER = new Map(LABELS.map(([key], i) => [key, i]));
const ALWAYS = new Set(['pass_yd', 'rush_yd', 'rec', 'rec_yd', 'pts_allow', 'yds_allow']);
const HIDDEN = /^(pts_allow_|yds_allow_|fgm_yds|fgm_lng|pos_rank|pts_(std|ppr|half_ppr|idp))/;
const UNIT: Record<string, string> = { pass_yd: 'pass yds', rush_yd: 'rush yds', rec_yd: 'rec yds', pass_cmp: 'cmp', rec: 'rec', rush_att: 'rush att' };

/** pass_td_40p → "40+ yd pass TD", bonus_rec_yd_100 → "100+ rec yds bonus". */
export function humanizeStatKey(key: string): string {
  let m = /^(pass|rush|rec)_td_(\d+)p$/.exec(key);
  if (m) return `${m[2]}+ yd ${m[1]} TD`;
  m = /^bonus_(.+?)_(\d+)p?$/.exec(key);
  if (m) return `${m[2]}+ ${UNIT[m[1] ?? ''] ?? (m[1] ?? '').replace(/_/g, ' ')} bonus`;
  m = /^(pass|rush|rec)_(\d+)_(\d+)$/.exec(key);
  if (m) return `${m[2]}-${m[3]} yd ${m[1]}`;
  m = /^(pass|rush|rec)_(\d+)p$/.exec(key);
  if (m) return `${m[2]}+ yd ${m[1]}`;
  m = /^bonus_rec_(te|rb|wr)$/.exec(key);
  if (m) return `${(m[1] ?? '').toUpperCase()} rec bonus`;
  return key.replace(/^bonus_(.+)$/, '$1 bonus').replace(/_/g, ' ');
}

/** "+1 rec · +15 rec yds · 40+ yd rec TD" for the keys that matter in any of `scorings`. */
export function describeStatDelta(delta: StatLine, scorings: ScoringSettings[]): string {
  const parts: Array<{ key: string; text: string }> = [];
  const tags: string[] = [];
  let fold = false;
  for (const [key, v] of Object.entries(delta)) {
    if (HIDDEN.test(key)) continue;
    const scored = scorings.some((s) => !!s[key]);
    if (!scored && !ALWAYS.has(key)) continue;
    const label = LABEL.get(key);
    if (label) parts.push({ key, text: `${v > 0 ? '+' : ''}${v} ${label}` });
    else if (v === 1) tags.push(humanizeStatKey(key));
    else if (v > 1) fold = true;
  }
  parts.sort((a, b) => (ORDER.get(a.key) ?? 0) - (ORDER.get(b.key) ?? 0));
  const extra = tags.length > 2 || (fold && !tags.length) ? ['big-play bonus'] : tags;
  return [...parts.map((p) => p.text), ...extra].join(' · ');
}

export interface StatEventImpact {
  leagueId: string;
  leagueName: string;
  side: 'me' | 'opp';
  pts: number;
}

export interface StatEvent {
  id: string;
  ts: number;
  playerId: string;
  text: string;
  impacts: StatEventImpact[];
  net: number;
}

/** Players worth watching: the user's starters and this week's opponents' starters. */
export function watchedPlayers(index: InvertedRosterIndex): Map<string, Array<{ leagueId: string; leagueName: string; side: 'me' | 'opp'; scoring: ScoringSettings }>> {
  const out = new Map<string, Array<{ leagueId: string; leagueName: string; side: 'me' | 'opp'; scoring: ScoringSettings }>>();
  for (const entry of Object.values(index)) {
    const spots = [
      ...entry.startedInLeagues.map((c) => ({ leagueId: c.leagueId, leagueName: c.leagueName, side: 'me' as const, scoring: c.scoringSettings })),
      ...entry.facingInLeagues.map((c) => ({ leagueId: c.leagueId, leagueName: c.leagueName, side: 'opp' as const, scoring: c.scoringSettings }))
    ];
    if (spots.length) out.set(entry.playerId, spots);
  }
  return out;
}

/**
 * Two stat snapshots → one event per watched player whose points moved.
 * A player missing from `prev` wasn't tracked yet and becomes the baseline.
 */
export function diffStatSnapshots(
  prev: Record<string, StatLine>,
  cur: Record<string, StatLine>,
  index: InvertedRosterIndex,
  ts: number,
  include: (playerId: string) => boolean = () => true
): StatEvent[] {
  const events: StatEvent[] = [];
  for (const [pid, spots] of watchedPlayers(index)) {
    if (!(pid in prev) || !include(pid)) continue;
    const delta = statLineDelta(prev[pid], cur[pid]);
    if (!Object.keys(delta).length) continue;
    const impacts = spots.map((s) => ({ leagueId: s.leagueId, leagueName: s.leagueName, side: s.side, pts: statLinePoints(delta, s.scoring) }));
    if (impacts.every((i) => i.pts === 0)) continue;
    events.push({
      id: `${ts}-${pid}`,
      ts,
      playerId: pid,
      text: describeStatDelta(delta, spots.map((s) => s.scoring)),
      impacts,
      net: round2(impacts.reduce((t, i) => t + (i.side === 'me' ? i.pts : -i.pts), 0))
    });
  }
  return events.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

/** Keep only watched players; {} marks "tracked, no stats yet" so their first play still counts. */
export function trimSnapshot(stats: Record<string, StatLine>, index: InvertedRosterIndex): Record<string, StatLine> {
  const out: Record<string, StatLine> = {};
  for (const pid of watchedPlayers(index).keys()) out[pid] = stats[pid] ?? {};
  return out;
}
