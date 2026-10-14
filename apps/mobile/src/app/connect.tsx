// One-step setup link: nightowl://connect?username=<sleeper username>
// Looks the user up, tracks all of this season's leagues at 1x, and opens
// the tabs. Falls back to onboarding (prefilled) when anything is missing.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { sleeper } from '../lib/clients';
import { useNightOwlStore } from '../store/useNightOwlStore';
import { colors } from '../theme';

export default function Connect() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  const [message, setMessage] = useState('Connecting to Sleeper…');

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      const name = (username ?? '').trim();
      if (!name) {
        router.replace('/onboarding');
        return;
      }
      try {
        const [user, state] = await Promise.all([sleeper.getUser(name), sleeper.getNflState()]);
        if (cancelled) return;
        if (!user) {
          setMessage(`No Sleeper account named "${name}".`);
          setTimeout(() => router.replace('/onboarding'), 1500);
          return;
        }
        const season = state.league_season || state.season;
        const leagues = await sleeper.getUserLeagues(user.user_id, season);
        if (cancelled) return;
        const store = useNightOwlStore.getState();
        store.setUser(user, season);
        store.setIncludedLeagueIds(leagues.map((l) => l.league_id));
        router.replace('/');
      } catch {
        if (!cancelled) {
          setMessage("Couldn't reach Sleeper.");
          setTimeout(() => router.replace('/onboarding'), 1500);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <View className="flex-1 items-center justify-center bg-night-950 px-8">
      <ActivityIndicator color={colors.cyan} />
      <Text className="mt-4 text-center text-[15px] text-night-300">{message}</Text>
    </View>
  );
}
