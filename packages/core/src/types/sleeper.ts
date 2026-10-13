export type SeasonType = 'pre' | 'regular' | 'post' | 'off';

export interface SleeperNflState {
  week: number;
  season_type: SeasonType;
  season_start_date: string;
  season: string;
  previous_season: string;
  leg: number;
  league_season: string;
  league_create_season: string;
  /** Lags `week` from Monday night until midweek; the week fans think of. */
  display_week: number;
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: {
    team_name?: string;
    avatar?: string;
  } | null;
}

/**
 * Sleeper scoring keys covering Standard, PPR, Half-PPR, tiered PPR, TE
 * premium, first downs, yardage milestones, distance TDs, kicking, DST and
 * IDP. Sleeper adds keys freely, so any other key is allowed too.
 */
export interface ScoringSettings {
  // Passing
  pass_yd?: number;
  pass_td?: number;
  pass_int?: number;
  pass_2pt?: number;
  pass_cmp?: number;
  pass_inc?: number;
  pass_att?: number;
  pass_fd?: number;
  pass_sack?: number;
  pass_int_td?: number;
  pass_cmp_40p?: number;
  bonus_pass_td_40p?: number;
  bonus_pass_td_50p?: number;
  bonus_pass_yd_300?: number;
  bonus_pass_yd_400?: number;

  // Rushing
  rush_yd?: number;
  rush_td?: number;
  rush_2pt?: number;
  rush_att?: number;
  rush_fd?: number;
  rush_40p?: number;
  bonus_rush_td_40p?: number;
  bonus_rush_td_50p?: number;
  bonus_rush_yd_100?: number;
  bonus_rush_yd_200?: number;

  // Receiving
  rec?: number;
  rec_yd?: number;
  rec_td?: number;
  rec_2pt?: number;
  rec_fd?: number;
  rec_40p?: number;
  bonus_rec_td_40p?: number;
  bonus_rec_td_50p?: number;
  bonus_rec_yd_100?: number;
  bonus_rec_yd_200?: number;

  // Position-specific reception premiums
  bonus_rec_te?: number;
  bonus_rec_rb?: number;
  bonus_rec_wr?: number;

  // Tiered PPR by single-reception yardage
  rec_0_4?: number;
  rec_5_9?: number;
  rec_10_19?: number;
  rec_20_29?: number;
  rec_30_39?: number;
  rec_40p_tiered?: number;

  // Fumbles
  fum?: number;
  fum_lost?: number;

  // IDP
  idp_tkl?: number;
  idp_tkl_solo?: number;
  idp_tkl_ast?: number;
  idp_tkl_loss?: number;
  idp_sack?: number;
  idp_int?: number;
  idp_ff?: number;
  idp_fr?: number;
  idp_pass_def?: number;
  idp_td?: number;
  idp_safe?: number;

  [customKey: string]: number | undefined;
}

export type RosterSlotType =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'FLEX'
  | 'SUPER_FLEX'
  | 'REC_FLEX'
  | 'WRRB_FLEX'
  | 'K'
  | 'DEF'
  | 'DL'
  | 'LB'
  | 'DB'
  | 'IDP_FLEX'
  | 'BN'
  | 'IR'
  | 'TAXI';

/** 0 = redraft, 1 = keeper, 2 = dynasty. */
export type LeagueKind = 0 | 1 | 2;

export interface SleeperLeagueSettings {
  num_teams: number;
  playoff_teams: number;
  playoff_week_start: number;
  waiver_type: number;
  /** 1 = an extra game against the league median each week. */
  league_average_match?: number;
  /** 1 = best ball: Sleeper sets the lineup. */
  best_ball?: number;
  type: LeagueKind;
  start_week?: number;
  last_scored_leg?: number;
}

export type LeagueStatus = 'pre_draft' | 'drafting' | 'in_season' | 'complete';

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: LeagueStatus;
  total_rosters: number;
  roster_positions: RosterSlotType[];
  scoring_settings: ScoringSettings;
  settings: SleeperLeagueSettings;
  avatar: string | null;
  draft_id: string | null;
  previous_league_id?: string | null;
}

export interface SleeperRosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  /** Max points: the best possible lineup every week. */
  ppts?: number;
  ppts_decimal?: number;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  league_id: string;
  /** Matches the non-BN/IR/TAXI slots of roster_positions; "0" = empty. */
  starters: string[];
  players: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: SleeperRosterSettings;
}

export interface SleeperMatchup {
  /** Null on a playoff bye or a median-only week. */
  matchup_id: number | null;
  roster_id: number;
  players: string[];
  starters: string[];
  points: number;
  custom_points?: number | null;
  starters_points: number[];
  players_points: Record<string, number>;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  /** The roster the pick originally belonged to. */
  roster_id: number;
  /** The roster that holds it now. */
  owner_id: number;
  previous_owner_id: number;
}

export type FantasyPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'DL' | 'LB' | 'DB';

export const FANTASY_POSITIONS: readonly FantasyPosition[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'];

export type InjuryStatus = 'Out' | 'Doubtful' | 'Questionable' | 'IR' | 'PUP' | 'Sus' | 'Cov' | 'NA' | null;

export interface SlimNflPlayer {
  player_id: string;
  espn_id: string | null;
  full_name: string;
  first_name: string;
  last_name: string;
  /** Lowercase, alphanumeric, Jr/Sr/II/III/IV stripped, nicknames resolved. */
  normalized_name: string;
  position: FantasyPosition;
  fantasy_positions: FantasyPosition[];
  team: string | null;
  injury_status: InjuryStatus;
  injury_notes: string | null;
  number: number | null;
  age: number | null;
  years_exp: number | null;
  /** Sleeper's search rank, an ADP proxy (lower = better). */
  search_rank: number | null;
}

/** One row of /players/nfl, as much of it as Night Owl reads. */
export interface SleeperRawPlayer {
  player_id: string;
  espn_id?: string | number | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  injury_status?: string | null;
  injury_notes?: string | null;
  number?: number | string | null;
  age?: number | null;
  years_exp?: number | null;
  search_rank?: number | null;
  active?: boolean;
}

/** A player's stat line keyed by Sleeper stat key (pass_yd, rec, bonus_rec_yd_100 ...). */
export type StatLine = Record<string, number>;

/** Row of api.sleeper.com/stats or /projections. */
export interface SleeperStatRow {
  player_id: string;
  team: string | null;
  game_id?: string | null;
  stats: StatLine;
  player?: {
    first_name?: string;
    last_name?: string;
    position?: string;
  } | null;
}

/** Row of api.sleeper.com/schedule. */
export interface SleeperScheduleGame {
  week: number;
  date: string;
  away: string;
  home: string;
  status: 'pre_game' | 'in_game' | 'complete' | string;
  game_id: string;
}

/** One Sleeper Picks market from /lines/available. */
export interface SleeperPicksEntry {
  subject_id: string | number;
  subject_type: string;
  wager_type: string;
  game_id?: string;
  updated_at?: number;
  options: Array<{
    sport: string;
    outcome: 'over' | 'under' | string;
    outcome_value: string | number;
    payout_multiplier: string | number;
  }>;
  recent_performance?: {
    values?: Array<{ date?: string; opponent?: string; value: number | null }>;
  } | null;
}
