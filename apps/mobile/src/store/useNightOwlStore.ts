// App state: who the user is, which leagues count (and how much), the player
// hot map, league data, the inverted roster index, the slate and the feed.
// Settings persist to MMKV as they change; everything else is rebuilt from
// the network and SQLite.
import { create } from 'zustand';
import {
  buildInvertedRosterIndex,
  buildPlayerLookup
} from '@nightowl/core';
import type {
  EnrichedPlayEvent,
  FeedFilterMode,
  InvertedRosterIndex,
  LiveMatchupSummary,
  NflGame,
  PlayerLookup,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperRoster,
  SleeperUser,
  SlimNflPlayer
} from '@nightowl/core';
import { settings } from '../db/mmkvStorage';

export const LEAGUE_WEIGHT_STEPS = [0.5, 1, 2, 3] as const;
const MAX_FEED = 400;

export interface NightOwlState {
  // Account and preferences (persisted)
  user: SleeperUser | null;
  season: string | null;
  includedLeagueIds: string[];
  leagueWeights: Record<string, number>;
  hapticsEnabled: boolean;

  // Player directory
  players: Record<string, SlimNflPlayer>;
  lookup: PlayerLookup;
  playersReady: boolean;

  // Sleeper data
  nflState: SleeperNflState | null;
  week: number | null;
  leagues: SleeperLeague[];
  rostersByLeague: Record<string, SleeperRoster[]>;
  usersByLeague: Record<string, SleeperLeagueUser[]>;
  matchupsByLeague: Record<string, SleeperMatchup[]>;

  // Derived
  index: InvertedRosterIndex;
  matchupSummaries: LiveMatchupSummary[];

  // NFL slate
  games: NflGame[];
  teamsOnBye: string[];

  // Feed
  feed: EnrichedPlayEvent[];
  feedMode: FeedFilterMode;
  feedLeagueId: string | null;
  lastPollAt: number | null;
  /** Bumped to ask the live poller for an immediate poll (pull to refresh). */
  pollRequest: number;

  setUser: (user: SleeperUser, season: string) => void;
  signOut: () => void;
  setSeason: (season: string) => void;
  setIncludedLeagueIds: (ids: string[]) => void;
  setLeagueWeight: (leagueId: string, weight: number) => void;
  setHapticsEnabled: (on: boolean) => void;
  setPlayers: (players: Record<string, SlimNflPlayer>) => void;
  setNflState: (state: SleeperNflState, week: number) => void;
  setLeagues: (leagues: SleeperLeague[]) => void;
  setLeagueData: (leagueId: string, rosters: SleeperRoster[], users: SleeperLeagueUser[]) => void;
  setMatchups: (leagueId: string, matchups: SleeperMatchup[]) => void;
  setSlate: (games: NflGame[], teamsOnBye: string[]) => void;
  addPlays: (events: EnrichedPlayEvent[]) => void;
  replaceFeed: (events: EnrichedPlayEvent[]) => void;
  setFeedMode: (mode: FeedFilterMode) => void;
  setFeedLeague: (leagueId: string | null) => void;
  markPolled: (at: number) => void;
  requestPoll: () => void;
}

const emptyLookup = buildPlayerLookup([]);

/** Leagues the user chose to track (all of them until they choose). */
export function activeLeagues(state: Pick<NightOwlState, 'leagues' | 'includedLeagueIds'>): SleeperLeague[] {
  const chosen = new Set(state.includedLeagueIds);
  return chosen.size ? state.leagues.filter((l) => chosen.has(l.league_id)) : state.leagues;
}

function rebuild(state: NightOwlState): Pick<NightOwlState, 'index' | 'matchupSummaries'> {
  if (!state.user) return { index: {}, matchupSummaries: [] };
  const { index, matchupSummaries } = buildInvertedRosterIndex({
    userId: state.user.user_id,
    leagues: activeLeagues(state),
    rostersByLeague: state.rostersByLeague,
    matchupsByLeague: state.matchupsByLeague,
    usersByLeague: state.usersByLeague,
    playersMap: state.players,
    leagueWeights: state.leagueWeights
  });
  return { index, matchupSummaries };
}

export const useNightOwlStore = create<NightOwlState>()((set, get) => {
  const update = (patch: Partial<NightOwlState>, reindex = false): void => {
    set(patch);
    if (reindex) set(rebuild(get()));
  };

  return {
    user: settings.getActiveUser(),
    season: settings.getSeason(),
    includedLeagueIds: settings.getIncludedLeagueIds(),
    leagueWeights: settings.getLeagueWeights(),
    hapticsEnabled: settings.getHapticsEnabled(),

    players: {},
    lookup: emptyLookup,
    playersReady: false,

    nflState: null,
    week: null,
    leagues: [],
    rostersByLeague: {},
    usersByLeague: {},
    matchupsByLeague: {},

    index: {},
    matchupSummaries: [],

    games: [],
    teamsOnBye: [],

    feed: [],
    feedMode: 'ALL_ACTION',
    feedLeagueId: null,
    lastPollAt: null,
    pollRequest: 0,

    setUser: (user, season) => {
      settings.setActiveUser(user);
      settings.setSeason(season);
      update({ user, season }, true);
    },
    signOut: () => {
      settings.clearAccount();
      set({
        user: null,
        includedLeagueIds: [],
        leagueWeights: {},
        leagues: [],
        rostersByLeague: {},
        usersByLeague: {},
        matchupsByLeague: {},
        index: {},
        matchupSummaries: [],
        feed: [],
        feedLeagueId: null
      });
    },
    setSeason: (season) => {
      settings.setSeason(season);
      update({ season, leagues: [], rostersByLeague: {}, usersByLeague: {}, matchupsByLeague: {} }, true);
    },
    setIncludedLeagueIds: (ids) => {
      settings.setIncludedLeagueIds(ids);
      update({ includedLeagueIds: ids }, true);
    },
    setLeagueWeight: (leagueId, weight) => {
      const leagueWeights = { ...get().leagueWeights, [leagueId]: weight };
      settings.setLeagueWeights(leagueWeights);
      update({ leagueWeights }, true);
    },
    setHapticsEnabled: (on) => {
      settings.setHapticsEnabled(on);
      set({ hapticsEnabled: on });
    },
    setPlayers: (players) => update({ players, lookup: buildPlayerLookup(Object.values(players)), playersReady: true }, true),
    setNflState: (nflState, week) => set({ nflState, week }),
    setLeagues: (leagues) => update({ leagues }, true),
    setLeagueData: (leagueId, rosters, users) =>
      update(
        {
          rostersByLeague: { ...get().rostersByLeague, [leagueId]: rosters },
          usersByLeague: { ...get().usersByLeague, [leagueId]: users }
        },
        true
      ),
    setMatchups: (leagueId, matchups) => update({ matchupsByLeague: { ...get().matchupsByLeague, [leagueId]: matchups } }, true),
    setSlate: (games, teamsOnBye) => set({ games, teamsOnBye }),
    addPlays: (events) => {
      if (!events.length) return;
      const seen = new Set(events.map((e) => `${e.gameId}:${e.playId}`));
      const kept = get().feed.filter((e) => !seen.has(`${e.gameId}:${e.playId}`));
      const feed = [...events, ...kept].sort((a, b) => b.timestamp - a.timestamp || b.sequenceNumber - a.sequenceNumber).slice(0, MAX_FEED);
      set({ feed });
    },
    replaceFeed: (events) => set({ feed: events.slice(0, MAX_FEED) }),
    setFeedMode: (feedMode) => set({ feedMode }),
    setFeedLeague: (feedLeagueId) => set({ feedLeagueId }),
    markPolled: (lastPollAt) => set({ lastPollAt }),
    requestPoll: () => set({ pollRequest: get().pollRequest + 1 })
  };
});
