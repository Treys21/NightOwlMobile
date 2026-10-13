// Tab 1: RedZone. Every play touching your leagues, newest first, with what
// it did in each one.
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { filterFeed } from '@nightowl/core';
import type { EnrichedPlayEvent } from '@nightowl/core';
import { EmptyState, ScreenHeader, SkeletonRows } from '../../components/common/ui';
import { FeedFilterBar } from '../../components/feed/FeedFilterBar';
import { PlayEventCard } from '../../components/feed/PlayEventCard';
import { ScoreboardStrip } from '../../components/feed/ScoreboardStrip';
import { useNightOwlStore } from '../../store/useNightOwlStore';
import { colors } from '../../theme';
import { ago, kickoffLabel } from '../../utils/format';

function SettingsButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Account and leagues" onPress={() => router.push('/onboarding')} className="mb-1 h-9 w-9 items-center justify-center rounded-full bg-night-900">
      <SymbolView name="person.crop.circle" size={20} tintColor={colors.night300} />
    </Pressable>
  );
}

export default function RedZone() {
  const feed = useNightOwlStore((s) => s.feed);
  const mode = useNightOwlStore((s) => s.feedMode);
  const leagueId = useNightOwlStore((s) => s.feedLeagueId);
  const summaries = useNightOwlStore((s) => s.matchupSummaries);
  const games = useNightOwlStore((s) => s.games);
  const week = useNightOwlStore((s) => s.week);
  const lastPollAt = useNightOwlStore((s) => s.lastPollAt);
  const lookup = useNightOwlStore((s) => s.lookup);
  const ready = useNightOwlStore((s) => s.playersReady && s.leagues.length > 0);
  const setMode = useNightOwlStore((s) => s.setFeedMode);
  const setLeague = useNightOwlStore((s) => s.setFeedLeague);
  const requestPoll = useNightOwlStore((s) => s.requestPoll);
  const queryClient = useQueryClient();

  const shown = useMemo(() => filterFeed(feed, mode, leagueId), [feed, mode, leagueId]);
  const live = games.filter((g) => g.state === 'in').length;
  const next = games.find((g) => g.state === 'pre');
  const subtitle = week
    ? `Week ${week} · ${live ? `${live} ${live === 1 ? 'game' : 'games'} live` : next ? `Next kickoff ${kickoffLabel(next.kickoff)}` : 'All games final'}${lastPollAt ? ` · ${ago(lastPollAt)}` : ''}`
    : null;
  const winning = summaries.filter((m) => m.isWinning).length;
  const contested = summaries.filter((m) => m.opponentRosterId !== null).length;

  const renderItem = useCallback(({ item }: { item: EnrichedPlayEvent }) => <PlayEventCard event={item} playerOf={lookup.byId} />, [lookup]);

  const empty = !ready ? (
    <SkeletonRows count={4} height={132} />
  ) : feed.length ? (
    <EmptyState icon="line.3.horizontal.decrease.circle" title="Nothing in this view" body="No plays match this filter yet. Try All, or tap the selected league to clear it." />
  ) : (
    <EmptyState
      icon="football.fill"
      title={live ? 'Waiting for the next play' : 'No plays yet this week'}
      body={live ? 'Plays that move any of your matchups appear here within about 15 seconds.' : next ? `The feed comes alive at kickoff, ${kickoffLabel(next.kickoff)}.` : 'Plays show up here once games are under way.'}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-night-950" edges={['top']}>
      <ScreenHeader title="RedZone" subtitle={subtitle} right={<SettingsButton />} />
      {contested ? (
        <View className="flex-row items-center px-4 pb-2">
          <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: live ? colors.pos : colors.night500 }} />
          <Text className="ml-1.5 text-[13px] text-night-300">
            Leading in <Text className="font-bold text-night-100">{winning}</Text> of {contested}
          </Text>
        </View>
      ) : null}
      <ScoreboardStrip summaries={summaries} selected={leagueId} onSelect={setLeague} />
      <View className="px-4 pb-2 pt-3">
        <FeedFilterBar value={mode} onChange={setMode} />
      </View>
      <FlashList
        data={shown}
        renderItem={renderItem}
        keyExtractor={(e) => `${e.gameId}:${e.playId}`}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            tintColor={colors.night300}
            refreshing={false}
            onRefresh={() => {
              requestPoll();
              void queryClient.invalidateQueries({ queryKey: ['matchups'] });
            }}
          />
        }
      />
    </SafeAreaView>
  );
}
