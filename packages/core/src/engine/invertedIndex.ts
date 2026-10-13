// Cross-league portfolio: for every NFL player, where the user starts him,
// benches him, stashes him, and where an opponent this week starts him.
// O(L × R × P) over leagues, rosters and players.
import type {
  RosterSlotType,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperRoster,
  SlimNflPlayer
} from '../types/sleeper';
import type {
  InvertedRosterIndex,
  LeagueExposureContext,
  LiveMatchupSummary,
  PlayerPortfolioEntry,
  UserSlotCategory
} from '../types/index-engine';
import { unknownPlayer } from './playerNormalizer';
import { round2 } from './scoringEngine';

export const NON_STARTING_SLOTS: ReadonlySet<RosterSlotType> = new Set<RosterSlotType>(['BN', 'IR', 'TAXI']);

export interface InvertedIndexInput {
  userId: string;
  leagues: SleeperLeague[];
  rostersByLeague: Record<string, SleeperRoster[]>;
  matchupsByLeague: Record<string, SleeperMatchup[]>;
  usersByLeague: Record<string, SleeperLeagueUser[]>;
  playersMap: Record<string, SlimNflPlayer>;
  leagueWeights?: Record<string, number>;
}

export interface InvertedIndexResult {
  index: InvertedRosterIndex;
  matchupSummaries: LiveMatchupSummary[];
}

export const isEmptySlot = (pid: string | null | undefined): boolean => !pid || pid === '0';

export const ownsRoster = (roster: SleeperRoster, userId: string): boolean =>
  roster.owner_id === userId || (roster.co_owners ?? []).includes(userId);

/** "Team Name" if the manager set one, else their display name. */
export function teamNameFor(roster: SleeperRoster | undefined, users: SleeperLeagueUser[]): string {
  if (!roster) return 'Bye';
  const user = users.find((u) => u.user_id === roster.owner_id);
  return user?.metadata?.team_name?.trim() || user?.display_name || `Team ${roster.roster_id}`;
}

export const matchupPoints = (m: SleeperMatchup | undefined): number =>
  m ? round2(m.custom_points ?? m.points ?? 0) : 0;

/** The league's starting slots, in the order `starters` uses. */
export const startingSlots = (league: SleeperLeague): RosterSlotType[] =>
  league.roster_positions.filter((slot) => !NON_STARTING_SLOTS.has(slot));

function emptyEntry(player: SlimNflPlayer): PlayerPortfolioEntry {
  return {
    playerId: player.player_id,
    player,
    startedInLeagues: [],
    benchedInLeagues: [],
    irOrTaxiInLeagues: [],
    facingInLeagues: [],
    netLeverageCount: 0,
    weightedLeverageScore: 0,
    ownershipShare: 0,
    isHighConflictPlayer: false
  };
}

export function buildInvertedRosterIndex(input: InvertedIndexInput): InvertedIndexResult {
  const { userId, leagues, rostersByLeague, matchupsByLeague, usersByLeague, playersMap } = input;
  const weights = input.leagueWeights ?? {};
  const index: InvertedRosterIndex = {};
  const matchupSummaries: LiveMatchupSummary[] = [];

  const entryFor = (pid: string): PlayerPortfolioEntry => {
    let entry = index[pid];
    if (!entry) {
      entry = emptyEntry(playersMap[pid] ?? unknownPlayer(pid));
      index[pid] = entry;
    }
    return entry;
  };

  for (const league of leagues) {
    const leagueId = league.league_id;
    const rosters = rostersByLeague[leagueId] ?? [];
    const userRoster = rosters.find((r) => ownsRoster(r, userId));
    if (!userRoster) continue;

    const matchups = matchupsByLeague[leagueId] ?? [];
    const users = usersByLeague[leagueId] ?? [];
    const userMatchup = matchups.find((m) => m.roster_id === userRoster.roster_id);
    const opponentMatchup =
      userMatchup && userMatchup.matchup_id !== null
        ? matchups.find((m) => m.matchup_id !== null && m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id)
        : undefined;
    const opponentRoster = opponentMatchup ? rosters.find((r) => r.roster_id === opponentMatchup.roster_id) : undefined;
    const opponentDisplayName = opponentRoster ? teamNameFor(opponentRoster, users) : null;

    const slots = startingSlots(league);
    const starters = userMatchup?.starters ?? userRoster.starters ?? [];
    const slotOf = new Map<string, RosterSlotType>();
    starters.forEach((pid, i) => {
      const slot = slots[i];
      if (!isEmptySlot(pid) && slot) slotOf.set(pid, slot);
    });
    const reserve = new Set(userRoster.reserve ?? []);
    const taxi = new Set(userRoster.taxi ?? []);
    const oppStarters = new Set((opponentMatchup?.starters ?? []).filter((pid) => !isEmptySlot(pid)));
    const userPoints = matchupPoints(userMatchup);
    const opponentPoints = matchupPoints(opponentMatchup);
    const weight = weights[leagueId] ?? 1;

    const context = (pid: string, category: UserSlotCategory | null, slot: RosterSlotType | null, pointsFrom: SleeperMatchup | undefined): LeagueExposureContext => ({
      leagueId,
      leagueName: league.name.trim(),
      leagueAvatar: league.avatar,
      isBestBall: league.settings.best_ball === 1,
      scoringSettings: league.scoring_settings,
      userRosterId: userRoster.roster_id,
      userSlotCategory: category,
      userAssignedSlot: slot,
      isOpponentStarter: oppStarters.has(pid),
      opponentRosterId: opponentRoster?.roster_id ?? null,
      opponentDisplayName,
      userMatchupPoints: userPoints,
      opponentMatchupPoints: opponentPoints,
      playerPointsInLeagueThisWeek: round2(pointsFrom?.players_points?.[pid] ?? 0),
      leagueWeight: weight
    });

    const owned = new Set<string>([...(userRoster.players ?? []), ...slotOf.keys()]);
    for (const pid of owned) {
      if (isEmptySlot(pid)) continue;
      const entry = entryFor(pid);
      if (slotOf.has(pid)) {
        entry.startedInLeagues.push(context(pid, 'STARTER', slotOf.get(pid) ?? null, userMatchup));
      } else if (reserve.has(pid)) {
        entry.irOrTaxiInLeagues.push(context(pid, 'IR', 'IR', userMatchup));
      } else if (taxi.has(pid)) {
        entry.irOrTaxiInLeagues.push(context(pid, 'TAXI', 'TAXI', userMatchup));
      } else {
        entry.benchedInLeagues.push(context(pid, 'BENCH', 'BN', userMatchup));
      }
    }

    for (const pid of oppStarters) {
      // Multi-copy leagues can put one player on both sides; the user's own
      // context above is already flagged isOpponentStarter.
      const category: UserSlotCategory | null = slotOf.has(pid) ? 'STARTER' : owned.has(pid) ? 'BENCH' : null;
      entryFor(pid).facingInLeagues.push(context(pid, category, slotOf.get(pid) ?? null, opponentMatchup));
    }

    if (userMatchup) {
      const diff = round2(userPoints - opponentPoints);
      matchupSummaries.push({
        leagueId,
        leagueName: league.name.trim(),
        leagueAvatar: league.avatar,
        userRosterId: userRoster.roster_id,
        userTeamName: teamNameFor(userRoster, users),
        userPoints,
        opponentRosterId: opponentRoster?.roster_id ?? null,
        opponentTeamName: opponentDisplayName ?? 'Bye',
        opponentPoints,
        pointDifferential: diff,
        isWinning: opponentMatchup ? diff > 0 : false,
        isTied: opponentMatchup ? diff === 0 : false
      });
    }
  }

  const leagueCount = Math.max(1, leagues.length);
  const sum = (list: LeagueExposureContext[]): number => list.reduce((t, c) => t + c.leagueWeight, 0);
  for (const entry of Object.values(index)) {
    entry.netLeverageCount = entry.startedInLeagues.length - entry.facingInLeagues.length;
    entry.weightedLeverageScore = round2(sum(entry.startedInLeagues) - sum(entry.facingInLeagues));
    entry.ownershipShare =
      (entry.startedInLeagues.length + entry.benchedInLeagues.length + entry.irOrTaxiInLeagues.length) / leagueCount;
    entry.isHighConflictPlayer = entry.startedInLeagues.length > 0 && entry.facingInLeagues.length > 0;
  }

  return { index, matchupSummaries };
}

export type PortfolioFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'CONFLICTS';

/** The Lineup HQ list: rostered or faced players, filtered and searched, most exposure first. */
export function filterPortfolio(index: InvertedRosterIndex, filter: PortfolioFilter, query: string): PlayerPortfolioEntry[] {
  const q = query.trim().toLowerCase();
  return Object.values(index)
    .filter((e) => {
      if (filter === 'CONFLICTS' && !e.isHighConflictPlayer) return false;
      if (filter !== 'ALL' && filter !== 'CONFLICTS' && e.player.position !== filter) return false;
      return !q || e.player.full_name.toLowerCase().includes(q) || (e.player.team ?? '').toLowerCase() === q;
    })
    .sort(
      (a, b) =>
        b.startedInLeagues.length + b.facingInLeagues.length - (a.startedInLeagues.length + a.facingInLeagues.length) ||
        b.ownershipShare - a.ownershipShare ||
        a.player.full_name.localeCompare(b.player.full_name)
    );
}
