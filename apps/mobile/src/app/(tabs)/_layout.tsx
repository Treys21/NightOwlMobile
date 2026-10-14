// The four tabs. Sync hooks live here so they run only once the user has a
// Sleeper account set; without one, onboarding comes first.
import * as Haptics from 'expo-haptics';
import { Redirect, Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { usePlayerDatabase } from '../../hooks/usePlayerDatabase';
import { useLeagueSync } from '../../hooks/useLeagueSync';
import { useLivePlayPolling } from '../../hooks/useLivePlayPolling';
import { useNightOwlStore } from '../../store/useNightOwlStore';
import { colors } from '../../theme';
import { launchArgument } from '../../utils/launchArguments';

function Syncer() {
  usePlayerDatabase();
  useLeagueSync();
  useLivePlayPolling();
  // Simulator runs can open a tab directly: `-NightOwlOpenRoute /lineups`.
  useEffect(() => {
    const route = launchArgument('NightOwlOpenRoute');
    if (route === '/lineups' || route === '/vegas' || route === '/drafts' || route === '/season') router.navigate(route);
  }, []);
  return null;
}

/** `-NightOwlConnectUsername <name>` skips typing in onboarding. */
const launchUsername = (): string | null => launchArgument('NightOwlConnectUsername');

const icon = (name: SFSymbol) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} size={22} tintColor={color} />;
  };

export default function TabsLayout() {
  const user = useNightOwlStore((s) => s.user);
  const losing = useNightOwlStore((s) => s.matchupSummaries.filter((m) => m.opponentRosterId !== null && !m.isWinning && !m.isTied).length);
  const live = useNightOwlStore((s) => s.games.some((g) => g.state === 'in'));
  if (!user) {
    const username = launchUsername();
    return <Redirect href={username ? `/connect?username=${encodeURIComponent(username)}` : '/onboarding'} />;
  }

  return (
    <>
      <Syncer />
      <Tabs
        screenListeners={{ tabPress: () => void Haptics.selectionAsync() }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.cyan,
          tabBarInactiveTintColor: colors.night500,
          tabBarStyle: { backgroundColor: colors.night950, borderTopColor: colors.night800 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'RedZone',
            tabBarIcon: icon('dot.radiowaves.left.and.right'),
            tabBarBadge: live && losing ? losing : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.neg, fontSize: 10 }
          }}
        />
        <Tabs.Screen name="lineups" options={{ title: 'Lineups', tabBarIcon: icon('person.3.sequence.fill') }} />
        <Tabs.Screen name="vegas" options={{ title: 'Vegas', tabBarIcon: icon('chart.line.uptrend.xyaxis') }} />
        <Tabs.Screen name="drafts" options={{ title: 'Drafts', tabBarIcon: icon('square.grid.3x3.fill') }} />
        <Tabs.Screen name="season" options={{ title: 'Season', tabBarIcon: icon('list.number') }} />
      </Tabs>
    </>
  );
}
