import type {
  FantasyPosition,
  RosterSlotType,
  ScoringSettings,
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SlimNflPlayer
} from '../types/sleeper';
import { normalizePlayerName } from '../engine/playerNormalizer';

export function player(id: string, fullName: string, position: FantasyPosition, team: string | null, extra: Partial<SlimNflPlayer> = {}): SlimNflPlayer {
  const [first = '', ...rest] = fullName.split(' ');
  return {
    player_id: id,
    espn_id: null,
    full_name: fullName,
    first_name: first,
    last_name: rest.join(' '),
    normalized_name: normalizePlayerName(fullName),
    position,
    fantasy_positions: [position],
    team,
    injury_status: null,
    injury_notes: null,
    number: null,
    age: null,
    years_exp: null,
    search_rank: null,
    ...extra
  };
}

export const PPR: ScoringSettings = { pass_yd: 0.04, pass_td: 4, pass_int: -1, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6, fum_lost: -2 };
export const HALF: ScoringSettings = { ...PPR, rec: 0.5 };
export const STANDARD: ScoringSettings = { ...PPR, rec: 0 };

export const SLOTS: RosterSlotType[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'IR', 'TAXI'];

export function league(id: string, name: string, scoring: ScoringSettings = PPR, extra: Partial<SleeperLeague['settings']> = {}, slots: RosterSlotType[] = SLOTS): SleeperLeague {
  return {
    league_id: id,
    name,
    season: '2026',
    status: 'in_season',
    total_rosters: 12,
    roster_positions: slots,
    scoring_settings: scoring,
    settings: { num_teams: 12, playoff_teams: 6, playoff_week_start: 15, waiver_type: 2, type: 2, ...extra },
    avatar: null,
    draft_id: null
  };
}

export function roster(rosterId: number, ownerId: string, starters: string[], bench: string[] = [], reserve: string[] = [], taxi: string[] = []): SleeperRoster {
  return {
    roster_id: rosterId,
    owner_id: ownerId,
    co_owners: null,
    league_id: 'x',
    starters,
    players: [...starters.filter((p) => p !== '0'), ...bench, ...reserve, ...taxi],
    reserve,
    taxi,
    settings: { wins: 0, losses: 0, ties: 0, fpts: 0 }
  };
}

export function matchup(rosterId: number, matchupId: number | null, starters: string[], points = 0, playersPoints: Record<string, number> = {}): SleeperMatchup {
  return {
    matchup_id: matchupId,
    roster_id: rosterId,
    players: starters,
    starters,
    points,
    starters_points: starters.map((p) => playersPoints[p] ?? 0),
    players_points: playersPoints
  };
}
