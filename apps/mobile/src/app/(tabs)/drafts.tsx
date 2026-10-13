// Tab 4: Draft War Room. The live board (pinch to zoom, scroll both ways),
// an on-the-clock alert, and best available with portfolio exposure.
import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { boardRows } from '@nightowl/core';
import type { SleeperDraft } from '@nightowl/core';
import { EmptyState, ErrorBanner, ScreenHeader, SkeletonRows } from '../../components/common/ui';
import { CELL_HEIGHT, CELL_WIDTH, DraftGridCell } from '../../components/drafts/DraftGridCell';
import { DraftHeaderBar } from '../../components/drafts/DraftHeaderBar';
import { ExposureDrawer } from '../../components/drafts/ExposureDrawer';
import { useDraftSync } from '../../hooks/useDraftSync';
import { useNightOwlStore } from '../../store/useNightOwlStore';
import { colors } from '../../theme';

const HEADER_HEIGHT = 30;
const DRAWER_SPACE = 100;

export default function Drafts() {
  const user = useNightOwlStore((s) => s.user);
  const usersByLeague = useNightOwlStore((s) => s.usersByLeague);
  const rostersByLeague = useNightOwlStore((s) => s.rostersByLeague);
  const leagues = useNightOwlStore((s) => s.leagues);
  const sync = useDraftSync();
  const { draft, board } = sync;

  // Column headers: the manager drafting from each slot, when we know them.
  const slotNames = useMemo(() => {
    const names = new Map<number, string>();
    if (!draft) return names;
    const users = usersByLeague[draft.league_id] ?? [];
    const rosters = rostersByLeague[draft.league_id] ?? [];
    for (const [userId, slot] of Object.entries(draft.draft_order ?? {})) {
      const u = users.find((x) => x.user_id === userId);
      names.set(slot, userId === user?.user_id ? 'You' : (u?.metadata?.team_name || u?.display_name || `Slot ${slot}`));
    }
    for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id ?? {})) {
      if (names.has(Number(slot))) continue;
      const owner = rosters.find((r) => r.roster_id === rosterId)?.owner_id;
      const u = users.find((x) => x.user_id === owner);
      if (u) names.set(Number(slot), owner === user?.user_id ? 'You' : u.metadata?.team_name || u.display_name);
    }
    return names;
  }, [draft, usersByLeague, rostersByLeague, user]);

  const nameOf = (d: SleeperDraft): string => d.metadata?.name?.trim() || leagues.find((l) => l.league_id === d.league_id)?.name.trim() || `${d.season} draft`;
  const rows = board ? boardRows(board) : [];
  const gridWidth = (board?.teams ?? 0) * CELL_WIDTH + 8;
  const gridHeight = rows.length * CELL_HEIGHT + HEADER_HEIGHT + DRAWER_SPACE;
  const userId = user?.user_id ?? null;

  return (
    <SafeAreaView className="flex-1 bg-night-950" edges={['top']}>
      <ScreenHeader title="Drafts" subtitle={draft ? nameOf(draft) : sync.drafts.length ? null : 'Live and upcoming drafts'} />
      {sync.error && draft ? <ErrorBanner message="Lost the draft feed for a moment; retrying." onRetry={sync.refresh} /> : null}
      {sync.loading ? (
        <SkeletonRows count={3} height={90} />
      ) : !sync.drafts.length ? (
        <ScrollView refreshControl={<RefreshControl tintColor={colors.night300} refreshing={false} onRefresh={sync.refresh} />}>
          <EmptyState icon="square.grid.3x3" title="No drafts on deck" body="Live, paused and upcoming drafts in your leagues show up here, rookie drafts included." />
        </ScrollView>
      ) : (
        <View className="flex-1">
          <DraftHeaderBar drafts={sync.drafts} selectedId={sync.selectedId} onSelect={sync.select} draft={draft} board={board} nameOf={nameOf} />
          <ScrollView
            className="mt-3 flex-1"
            contentContainerStyle={{ width: gridWidth, height: gridHeight, paddingHorizontal: 4 }}
            minimumZoomScale={0.45}
            maximumZoomScale={1.6}
            bouncesZoom
            directionalLockEnabled={false}
            showsHorizontalScrollIndicator={false}
            refreshControl={<RefreshControl tintColor={colors.night300} refreshing={false} onRefresh={sync.refresh} />}
          >
            <View className="flex-row" style={{ height: HEADER_HEIGHT }}>
              {Array.from({ length: board?.teams ?? 0 }, (_, i) => {
                const slot = i + 1;
                const mine = board?.userSlot === slot;
                return (
                  <View key={slot} style={{ width: CELL_WIDTH }} className="items-center justify-center px-1">
                    <Text numberOfLines={1} className={`text-[11px] font-semibold ${mine ? 'text-owl-cyan' : 'text-night-500'}`}>
                      {slotNames.get(slot) ?? `Slot ${slot}`}
                    </Text>
                  </View>
                );
              })}
            </View>
            {rows.map((row, r) => (
              <View key={r} className="flex-row">
                {row.map((cell) => (
                  <DraftGridCell key={cell.pickNo} cell={cell} mine={!!userId && cell.pick?.picked_by === userId} />
                ))}
              </View>
            ))}
          </ScrollView>
          <ExposureDrawer players={sync.available} filter={sync.positionFilter} onFilter={sync.setPositionFilter} counted={sync.available[0]?.exposure.leaguesCounted ?? 0} />
        </View>
      )}
    </SafeAreaView>
  );
}
