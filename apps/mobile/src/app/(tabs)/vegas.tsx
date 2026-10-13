// Tab 3: Vegas Edge. Sportsbook lines turned into fantasy points under each
// league's scoring: bench upgrades, a head-to-head flex comparator, and every
// game's environment.
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SleeperLeague } from '@nightowl/core';
import { Chip, ChipRow, EmptyState, ErrorBanner, ScreenHeader, SectionLabel, SkeletonRows } from '../../components/common/ui';
import { FlexComparatorSheet } from '../../components/vegas/FlexComparatorSheet';
import type { ComparatorCandidate } from '../../components/vegas/FlexComparatorSheet';
import { GameEnvironmentCard } from '../../components/vegas/GameEnvironmentCard';
import { PropUpgradeCard } from '../../components/vegas/PropUpgradeCard';
import { useLineupAlerts, useVegasOdds } from '../../hooks/useVegasOdds';
import type { ScoringContext } from '../../hooks/useVegasOdds';
import { activeLeagues, useNightOwlStore } from '../../store/useNightOwlStore';
import { colors } from '../../theme';
import { ago } from '../../utils/format';

const FLEX = new Set(['RB', 'WR', 'TE']);

export default function Vegas() {
  const index = useNightOwlStore((s) => s.index);
  const leagues = useNightOwlStore((s) => s.leagues);
  const included = useNightOwlStore((s) => s.includedLeagueIds);
  const week = useNightOwlStore((s) => s.week);
  const vegas = useVegasOdds();
  const alerts = useLineupAlerts(vegas);
  const [context, setContext] = useState<ScoringContext>(null);
  const tracked: SleeperLeague[] = activeLeagues({ leagues, includedLeagueIds: included });

  const upgrades = useMemo(
    () => alerts.filter((a) => a.severity === 'VEGAS_UPGRADE' && (!context || a.leagueId === context)),
    [alerts, context]
  );

  // Everyone the user rosters who has a line, as comparator candidates.
  const candidates = useMemo((): ComparatorCandidate[] => {
    const out: ComparatorCandidate[] = [];
    for (const entry of Object.values(index)) {
      const starts = entry.startedInLeagues.filter((c) => !context || c.leagueId === context);
      const benches = [...entry.benchedInLeagues].filter((c) => !context || c.leagueId === context);
      if (!starts.length && !benches.length) continue;
      const projection = vegas.projection(entry.playerId, context);
      if (!projection) continue;
      out.push({ player: entry.player, projection, role: starts.length ? (context ? 'Starter' : `Starts in ${starts.length}`) : 'Bench' });
    }
    return out.sort((a, b) => b.projection.impliedFantasyPoints - a.projection.impliedFantasyPoints);
  }, [index, vegas, context]);

  const flex = candidates.filter((c) => FLEX.has(c.player.position));
  const lowestStarter = [...flex].reverse().find((c) => c.role !== 'Bench') ?? null;
  const bestBench = flex.find((c) => c.role === 'Bench') ?? flex.find((c) => c.player.player_id !== lowestStarter?.player.player_id) ?? null;
  const games = [...(vegas.slate?.games ?? [])].sort((a, b) => Date.parse(a.commenceTimeIso) - Date.parse(b.commenceTimeIso));
  const source = vegas.slate ? `DraftKings lines · Sleeper Picks prices · ${ago(vegas.slate.fetchedAtMs)}` : null;

  return (
    <SafeAreaView className="flex-1 bg-night-950" edges={['top']}>
      <ScreenHeader title="Vegas" subtitle={week ? `Week ${week}${source ? ` · ${source}` : ''}` : null} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl tintColor={colors.night300} refreshing={false} onRefresh={vegas.refetch} />}
      >
        {vegas.error && vegas.slate ? <ErrorBanner message="Couldn't refresh lines; showing the last ones." onRetry={vegas.refetch} /> : null}
        <View className="pt-1">
          <ChipRow>
            <Chip label="Portfolio avg" active={context === null} onPress={() => setContext(null)} />
            {tracked.map((l) => (
              <Chip key={l.league_id} label={l.name.trim()} active={context === l.league_id} onPress={() => setContext(l.league_id)} />
            ))}
          </ChipRow>
        </View>

        {vegas.loading ? (
          <View className="pt-4">
            <SkeletonRows count={3} height={120} />
          </View>
        ) : vegas.error && !vegas.slate ? (
          <EmptyState icon="wifi.exclamationmark" title="Lines didn't load" body="The sportsbook feeds didn't answer. Pull down to try again." />
        ) : (
          <>
            <SectionLabel>Bench upgrades</SectionLabel>
            {upgrades.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                {upgrades.map((a) => (
                  <PropUpgradeCard
                    key={a.alertId}
                    alert={a}
                    starterPoints={vegas.impliedPoints(a.starterPlayer.player_id, a.leagueId)}
                    benchPoints={a.recommendedSwapPlayer ? vegas.impliedPoints(a.recommendedSwapPlayer.player_id, a.leagueId) : null}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text className="px-4 text-[13px] text-night-500">No bench player out-projects a starter by 1.5+ implied points{context ? ' in this league' : ''}.</Text>
            )}

            <SectionLabel>Flex comparator</SectionLabel>
            {candidates.length >= 2 ? (
              <FlexComparatorSheet candidates={candidates} defaultA={lowestStarter} defaultB={bestBench} />
            ) : (
              <Text className="px-4 text-[13px] text-night-500">Lines for your players appear here as books post them, usually midweek.</Text>
            )}

            <SectionLabel>Games</SectionLabel>
            <View className="px-4">
              {games.length ? games.map((g) => <GameEnvironmentCard key={g.gameId} game={g} />) : <Text className="text-[13px] text-night-500">No game lines posted yet.</Text>}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
