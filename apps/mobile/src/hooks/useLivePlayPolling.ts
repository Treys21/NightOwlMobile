// The live feed. Every 15 s while the app is in the foreground and games are
// on: read each live game's play-by-play, diff it against what we've seen,
// score every new play in every tracked league, and push it to the feed.
// Kickers and team defenses come from Sleeper's stat lines instead (ESPN's
// play text can't score them exactly).
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  HAPTIC_PLAY_POINTS,
  PlayDiffer,
  diffStatSnapshots,
  enrichPlay,
  gamesToPoll,
  isLiveWindow,
  parseSummary,
  round2,
  statSeasonType,
  touchesPortfolio,
  trimSnapshot
} from '@nightowl/core';
import type { EnrichedPlayEvent, InvertedRosterIndex, StatEvent, StatLine } from '@nightowl/core';
import { loadPlayEvents, savePlayEvents } from '../db/sqliteClient';
import { IDLE_POLL_MS, LIVE_POLL_MS, espn, sleeper } from '../lib/clients';
import { useNightOwlStore } from '../store/useNightOwlStore';
import { updateLiveActivity } from '../utils/liveActivityBridge';

const KICKER_OR_DEF = new Set(['K', 'DEF']);
const SLATE_WINDOW_MS = 5 * 24 * 3600000;

/** A Sleeper stat-line event (kicker / defense) in the feed's shape. */
export function statEventToPlay(e: StatEvent, index: InvertedRosterIndex, gameId: string, teams: { away: string; home: string }): EnrichedPlayEvent {
  const entry = index[e.playerId];
  const name = entry?.player.full_name ?? e.playerId;
  const weightOf = new Map(
    [...(entry?.startedInLeagues ?? []), ...(entry?.facingInLeagues ?? [])].map((c) => [c.leagueId, c.leagueWeight])
  );
  const impacts = e.impacts
    .filter((i) => i.pts !== 0)
    .map((i) => ({
      leagueId: i.leagueId,
      leagueName: i.leagueName,
      playerId: e.playerId,
      playerName: name,
      pointsDelta: i.pts,
      perspective: i.side === 'me' ? ('FOR_USER' as const) : ('AGAINST_USER' as const),
      netLeagueDelta: i.side === 'me' ? i.pts : -i.pts,
      opponentName: i.side === 'opp' ? (entry?.facingInLeagues.find((c) => c.leagueId === i.leagueId)?.opponentDisplayName ?? null) : null
    }));
  return {
    playId: e.id,
    gameId,
    sequenceNumber: e.ts,
    timestamp: e.ts,
    awayTeam: teams.away,
    homeTeam: teams.home,
    awayScore: 0,
    homeScore: 0,
    quarter: 0,
    clock: '',
    downAndDistance: '',
    isScoringPlay: false,
    isRedZonePlay: false,
    isStatCorrectionOrReversal: false,
    description: `${name}: ${e.text}`,
    involvedPlayerIds: [e.playerId],
    statDeltas: [],
    leagueImpacts: impacts,
    totalNetPointsForUser: e.net,
    weightedNetPointsForUser: round2(impacts.reduce((t, i) => t + i.netLeagueDelta * (weightOf.get(i.leagueId) ?? 1), 0))
  };
}

export function useLivePlayPolling(): void {
  const differ = useRef(new PlayDiffer());
  const finalSeenAt = useRef(new Map<string, number>());
  const statSnapshot = useRef<Record<string, StatLine> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const user = useNightOwlStore((s) => s.user);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    // History first: a relaunch mid-game shows what already happened.
    loadPlayEvents(Date.now() - SLATE_WINDOW_MS)
      .then((events) => {
        if (!cancelled && events.length && !useNightOwlStore.getState().feed.length) useNightOwlStore.getState().replaceFeed(events);
      })
      .catch(() => undefined);

    const poll = async (): Promise<void> => {
      if (running.current) return;
      running.current = true;
      const now = Date.now();
      const state = useNightOwlStore.getState();
      try {
        if (!state.nflState || !state.week || !state.playersReady || !Object.keys(state.index).length) return;
        const games = state.games;
        differ.current.retain(games.map((g) => g.id));
        const fresh: EnrichedPlayEvent[] = [];
        let celebrate = false;

        for (const game of gamesToPoll(games, finalSeenAt.current, now)) {
          const summary = await espn.getSummary(game.id);
          const plays = parseSummary(summary, game.id, state.lookup, now);
          const { baseline, plays: diffed } = differ.current.ingest(game.id, plays);
          for (const d of diffed) {
            const event = enrichPlay(d, state.index, state.lookup.byId);
            if (!touchesPortfolio(event)) continue;
            fresh.push(event);
            if (!baseline && event.totalNetPointsForUser >= HAPTIC_PLAY_POINTS) celebrate = true;
          }
        }

        // Kickers and defenses, from Sleeper's live stat lines.
        if (games.some((g) => g.state === 'in')) {
          const rows = await sleeper.getWeekStats(state.nflState.season, state.week, statSeasonType(state.nflState), ['K', 'DEF']);
          const cur: Record<string, StatLine> = {};
          for (const r of rows) cur[r.player_id] = r.stats;
          const include = (pid: string): boolean => KICKER_OR_DEF.has(state.index[pid]?.player.position ?? '');
          if (statSnapshot.current) {
            for (const e of diffStatSnapshots(statSnapshot.current, cur, state.index, now, include)) {
              const team = state.index[e.playerId]?.player.team ?? '';
              const game = games.find((g) => g.home === team || g.away === team);
              fresh.push(statEventToPlay(e, state.index, game?.id ?? `sleeper-${team}`, { away: game?.away ?? team, home: game?.home ?? '' }));
            }
          }
          statSnapshot.current = { ...trimSnapshot(cur, state.index) };
        }

        if (fresh.length) {
          useNightOwlStore.getState().addPlays(fresh);
          await savePlayEvents(fresh);
        }
        if (celebrate && state.hapticsEnabled) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await updateLiveActivity(useNightOwlStore.getState());
      } catch {
        // A failed poll is retried on the next tick; the feed keeps what it has.
      } finally {
        running.current = false;
        useNightOwlStore.getState().markPolled(Date.now());
      }
    };

    const schedule = (): void => {
      if (timer.current) clearTimeout(timer.current);
      const live = isLiveWindow(useNightOwlStore.getState().games, Date.now());
      timer.current = setTimeout(() => {
        void poll().finally(() => {
          if (!cancelled && AppState.currentState === 'active') schedule();
        });
      }, live ? LIVE_POLL_MS : IDLE_POLL_MS);
    };

    void poll().finally(schedule);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void poll().finally(schedule);
      } else if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    });

    const unsubscribe = useNightOwlStore.subscribe((next, prev) => {
      if (next.pollRequest !== prev.pollRequest) void poll().finally(schedule);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user]);
}
