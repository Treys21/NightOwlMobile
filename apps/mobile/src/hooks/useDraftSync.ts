// The draft war room's data: the user's live, paused and upcoming drafts,
// the selected draft's picks (every 5 s while it's live), the board, and
// best available with portfolio exposure from the user's other leagues.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { activeDrafts, buildDraftBoard, draftExposure, ownsRoster } from '@nightowl/core';
import type { DraftBoardModel, DraftExposureRow, SleeperDraft, SleeperDraftPick, SlimNflPlayer } from '@nightowl/core';
import { bestAvailable } from '../db/sqliteClient';
import { DRAFT_POLL_MS, sleeper } from '../lib/clients';
import { useNightOwlStore } from '../store/useNightOwlStore';

const BEST_AVAILABLE = 60;

export interface AvailablePlayer {
  player: SlimNflPlayer;
  exposure: DraftExposureRow;
}

export interface DraftSync {
  drafts: SleeperDraft[];
  loading: boolean;
  error: Error | null;
  selectedId: string | null;
  select: (draftId: string) => void;
  draft: SleeperDraft | null;
  picks: SleeperDraftPick[];
  board: DraftBoardModel | null;
  available: AvailablePlayer[];
  positionFilter: string;
  setPositionFilter: (pos: string) => void;
  leagueNameOf: (leagueId: string) => string;
  refresh: () => void;
}

export const DRAFT_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

export function useDraftSync(): DraftSync {
  const user = useNightOwlStore((s) => s.user);
  const season = useNightOwlStore((s) => s.season);
  const leagues = useNightOwlStore((s) => s.leagues);
  const rostersByLeague = useNightOwlStore((s) => s.rostersByLeague);
  const ready = useNightOwlStore((s) => s.playersReady);
  const haptics = useNightOwlStore((s) => s.hapticsEnabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [available, setAvailable] = useState<AvailablePlayer[]>([]);
  const wasOnClock = useRef(false);

  const draftsQuery = useQuery({
    queryKey: ['drafts', user?.user_id, season],
    queryFn: async () => activeDrafts(await sleeper.getUserDrafts(user?.user_id ?? '', season ?? '')),
    enabled: !!user && !!season,
    refetchInterval: 60000
  });
  const drafts = draftsQuery.data ?? [];
  const current = drafts.find((d) => d.draft_id === selectedId) ?? drafts[0] ?? null;
  const live = current?.status === 'drafting';

  const draftQuery = useQuery({
    queryKey: ['draft', current?.draft_id],
    queryFn: () => sleeper.getDraft(current?.draft_id ?? ''),
    enabled: !!current,
    refetchInterval: live ? DRAFT_POLL_MS : 60000
  });
  const picksQuery = useQuery({
    queryKey: ['draft-picks', current?.draft_id],
    queryFn: () => sleeper.getDraftPicks(current?.draft_id ?? ''),
    enabled: !!current,
    refetchInterval: live ? DRAFT_POLL_MS : 60000
  });

  const draft = draftQuery.data ?? current;
  const picks = picksQuery.data ?? [];
  const board = useMemo(() => (draft ? buildDraftBoard(draft, picks, user?.user_id ?? null) : null), [draft, picks, user]);

  // A buzz when it becomes the user's turn.
  useEffect(() => {
    const onClock = board?.picksUntilUser === 0;
    if (onClock && !wasOnClock.current && haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    wasOnClock.current = onClock;
  }, [board?.picksUntilUser, haptics]);

  // Exposure is measured against the user's other leagues' rosters.
  const otherRosters = useMemo(() => {
    if (!user) return [];
    return leagues
      .filter((l) => l.league_id !== draft?.league_id)
      .map((l) => (rostersByLeague[l.league_id] ?? []).find((r) => ownsRoster(r, user.user_id)))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => new Set(r.players ?? []));
  }, [leagues, rostersByLeague, user, draft?.league_id]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const drafted = new Set(picks.map((p) => p.player_id));
    const positions = positionFilter === 'ALL' ? ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] : [positionFilter];
    bestAvailable(drafted, positions, BEST_AVAILABLE)
      .then((list) => {
        if (cancelled) return;
        const exposure = draftExposure(list.map((p) => p.player_id), otherRosters);
        setAvailable(list.map((player, i) => ({ player, exposure: exposure[i] ?? { playerId: player.player_id, portfolioShare: 0, leaguesOwned: 0, leaguesCounted: 0 } })));
      })
      .catch(() => {
        if (!cancelled) setAvailable([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, picks, positionFilter, otherRosters]);

  return {
    drafts,
    loading: draftsQuery.isLoading,
    error: draftsQuery.error ?? draftQuery.error ?? picksQuery.error,
    selectedId: current?.draft_id ?? null,
    select: setSelectedId,
    draft: draft ?? null,
    picks,
    board,
    available,
    positionFilter,
    setPositionFilter,
    leagueNameOf: (leagueId) => leagues.find((l) => l.league_id === leagueId)?.name.trim() ?? 'Draft',
    refresh: () => {
      void draftsQuery.refetch();
      void draftQuery.refetch();
      void picksQuery.refetch();
    }
  };
}
