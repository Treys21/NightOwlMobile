// Tab 2: Lineup HQ. What needs fixing before lock, then every player you
// roster or face this week, across every league.
import { FlashList } from '@shopify/flash-list';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { filterPortfolio } from '@nightowl/core';
import type { PlayerPortfolioEntry, PortfolioFilter } from '@nightowl/core';
import { Chip, ChipRow, EmptyState, ScreenHeader, SectionLabel, SkeletonRows } from '../../components/common/ui';
import { ActionRequiredBanner } from '../../components/lineups/ActionRequiredBanner';
import { PlayerExposureRow } from '../../components/lineups/PlayerExposureRow';
import { useLineupAlerts, useVegasOdds } from '../../hooks/useVegasOdds';
import { activeLeagues, useNightOwlStore } from '../../store/useNightOwlStore';
import { colors } from '../../theme';

const FILTERS: Array<{ value: PortfolioFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'QB', label: 'QB' },
  { value: 'RB', label: 'RB' },
  { value: 'WR', label: 'WR' },
  { value: 'TE', label: 'TE' },
  { value: 'CONFLICTS', label: 'Conflicts' }
];

export default function Lineups() {
  const index = useNightOwlStore((s) => s.index);
  const week = useNightOwlStore((s) => s.week);
  const teamsOnBye = useNightOwlStore((s) => s.teamsOnBye);
  const leagues = useNightOwlStore((s) => s.leagues);
  const included = useNightOwlStore((s) => s.includedLeagueIds);
  const ready = useNightOwlStore((s) => s.playersReady && Object.keys(s.rostersByLeague).length > 0);
  const vegas = useVegasOdds();
  const alerts = useLineupAlerts(vegas);
  const [filter, setFilter] = useState<PortfolioFilter>('ALL');
  const [query, setQuery] = useState('');

  const byes = useMemo(() => new Set(teamsOnBye), [teamsOnBye]);
  const rows = useMemo(() => filterPortfolio(index, filter, query), [index, filter, query]);
  const starters = useMemo(() => Object.values(index).reduce((n, e) => n + e.startedInLeagues.length, 0), [index]);
  const conflicts = useMemo(() => Object.values(index).filter((e) => e.isHighConflictPlayer).length, [index]);
  const leagueCount = activeLeagues({ leagues, includedLeagueIds: included }).length;

  const renderItem = useCallback(
    ({ item }: { item: PlayerPortfolioEntry }) => <PlayerExposureRow entry={item} bye={!!item.player.team && byes.has(item.player.team)} />,
    [byes]
  );

  const header = (
    <View>
      {alerts.length ? (
        <View className="pt-2">
          <ActionRequiredBanner alerts={alerts} />
        </View>
      ) : ready ? (
        <View className="mx-4 mt-2 flex-row items-center rounded-2xl border border-delta-pos/30 bg-delta-pos/10 px-3 py-2.5">
          <SymbolView name="checkmark.seal.fill" size={16} tintColor={colors.pos} />
          <Text className="ml-2 flex-1 text-[13px] text-night-100">Every lineup is set: no one out, on bye, or beaten by your bench.</Text>
        </View>
      ) : null}
      <SectionLabel>{`Exposure · ${starters} starts${conflicts ? ` · ${conflicts} conflicts` : ''}`}</SectionLabel>
      <View className="mx-4 mb-2.5 flex-row items-center rounded-xl border border-night-700 bg-night-900 px-3">
        <SymbolView name="magnifyingglass" size={14} tintColor={colors.night500} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search players or a team"
          placeholderTextColor={colors.night500}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          className="ml-2 flex-1 py-2.5 text-[15px] text-night-100"
        />
      </View>
      <View className="mb-3">
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} tone={f.value === 'CONFLICTS' ? colors.warn : undefined} />
          ))}
        </ChipRow>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-night-950" edges={['top']}>
      <ScreenHeader title="Lineups" subtitle={week ? `Week ${week} · ${leagueCount} ${leagueCount === 1 ? 'league' : 'leagues'}` : null} />
      <FlashList
        data={ready ? rows : []}
        renderItem={renderItem}
        keyExtractor={(e) => e.playerId}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !ready ? (
            <SkeletonRows count={6} height={64} />
          ) : (
            <EmptyState icon="person.crop.circle.badge.questionmark" title="No players here" body={query ? `Nobody matches "${query}".` : 'No players fit this filter this week.'} />
          )
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardDismissMode="on-drag"
      />
    </SafeAreaView>
  );
}
