// Sign-in without a password: Sleeper's API is public and read-only, so a
// username is all Night Owl needs. Pick a season, choose which leagues count
// and how much each one matters, and go.
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarUrl, scoringTags } from '@nightowl/core';
import type { SleeperLeague, SleeperUser } from '@nightowl/core';
import { Chip, PrimaryButton } from '../components/common/ui';
import { sleeper } from '../lib/clients';
import { LEAGUE_WEIGHT_STEPS, useNightOwlStore } from '../store/useNightOwlStore';
import { colors } from '../theme';

const KIND = ['Redraft', 'Keeper', 'Dynasty'];

function WeightStepper({ value, onChange }: { value: number; onChange: (w: number) => void }) {
  return (
    <View className="flex-row rounded-lg bg-night-950 p-0.5">
      {LEAGUE_WEIGHT_STEPS.map((w) => (
        <Pressable
          key={w}
          accessibilityRole="button"
          accessibilityLabel={`Weight ${w}x`}
          accessibilityState={{ selected: value === w }}
          onPress={() => {
            void Haptics.selectionAsync();
            onChange(w);
          }}
          className={`rounded-md px-2 py-1 ${value === w ? 'bg-night-700' : ''}`}
        >
          <Text className={`text-[12px] font-semibold ${value === w ? 'text-night-100' : 'text-night-500'}`}>{w}x</Text>
        </Pressable>
      ))}
    </View>
  );
}

function LeagueRow({ league, on, weight, onToggle, onWeight }: { league: SleeperLeague; on: boolean; weight: number; onToggle: () => void; onWeight: (w: number) => void }) {
  const tags = scoringTags(league.scoring_settings, league.roster_positions, league.settings.best_ball === 1);
  const avatar = avatarUrl(league.avatar);
  return (
    <View className={`mb-2 rounded-2xl border p-3 ${on ? 'border-night-700 bg-night-900' : 'border-night-800 bg-night-950'}`}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onToggle} className="flex-row items-center">
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: 40, height: 40, borderRadius: 10 }} />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-[10px] bg-night-800">
            <Text className="text-[16px] font-bold text-night-300">{league.name.trim().charAt(0)}</Text>
          </View>
        )}
        <View className="ml-3 flex-1">
          <Text numberOfLines={1} className={`text-[15px] font-semibold ${on ? 'text-night-100' : 'text-night-500'}`}>
            {league.name.trim()}
          </Text>
          <Text numberOfLines={1} className="text-[12px] text-night-500">
            {league.total_rosters} teams · {KIND[league.settings.type] ?? 'League'} · {tags.join(' · ')}
          </Text>
        </View>
        <SymbolView name={on ? 'checkmark.circle.fill' : 'circle'} size={22} tintColor={on ? colors.cyan : colors.night700} />
      </Pressable>
      {on ? (
        <View className="mt-2.5 flex-row items-center justify-between border-t border-night-800 pt-2.5">
          <Text className="text-[12px] text-night-300">How much this league matters</Text>
          <WeightStepper value={weight} onChange={onWeight} />
        </View>
      ) : null}
    </View>
  );
}

export default function Onboarding() {
  const store = useNightOwlStore();
  const [username, setUsername] = useState(store.user?.username ?? '');
  const [found, setFound] = useState<SleeperUser | null>(store.user);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<string | null>(store.season);
  const [selected, setSelected] = useState<Set<string> | null>(store.includedLeagueIds.length ? new Set(store.includedLeagueIds) : null);
  const [weights, setWeights] = useState<Record<string, number>>(store.leagueWeights);

  const stateQuery = useQuery({ queryKey: ['nfl-state'], queryFn: () => sleeper.getNflState(), staleTime: 10 * 60000 });
  const current = stateQuery.data?.league_season ?? stateQuery.data?.season ?? null;
  const seasons = useMemo(() => (current ? [current, String(Number(current) - 1)] : []), [current]);
  useEffect(() => {
    if (!season && current) setSeason(current);
  }, [current, season]);

  const leaguesQuery = useQuery({
    queryKey: ['leagues', found?.user_id, season],
    queryFn: () => sleeper.getUserLeagues(found?.user_id ?? '', season ?? ''),
    enabled: !!found && !!season
  });
  const leagues = leaguesQuery.data ?? [];
  const isOn = (id: string): boolean => (selected ? selected.has(id) : true);
  const chosen = leagues.filter((l) => isOn(l.league_id));

  const search = async (): Promise<void> => {
    const name = username.trim();
    if (!name) return;
    setSearching(true);
    setError(null);
    try {
      const user = await sleeper.getUser(name);
      if (!user) {
        setFound(null);
        setError(`No Sleeper account named "${name}".`);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        if (user.user_id !== found?.user_id) setSelected(null);
        setFound(user);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setError("Couldn't reach Sleeper. Check your connection and try again.");
    } finally {
      setSearching(false);
    }
  };

  const toggle = (id: string): void => {
    void Haptics.selectionAsync();
    const next = new Set(selected ?? leagues.map((l) => l.league_id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const finish = (): void => {
    if (!found || !season) return;
    store.setUser(found, season);
    if (season !== store.season) store.setSeason(season);
    store.setIncludedLeagueIds(chosen.map((l) => l.league_id));
    for (const l of chosen) store.setLeagueWeight(l.league_id, weights[l.league_id] ?? 1);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-night-950" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <View className="mb-6 mt-4 h-14 w-14 items-center justify-center rounded-2xl bg-night-800">
            <SymbolView name="moon.stars.fill" size={28} tintColor={colors.cyan} />
          </View>
          <Text className="text-[32px] font-bold tracking-tight text-night-100">Night Owl</Text>
          <Text className="mt-1.5 text-[15px] leading-6 text-night-300">
            Every play that moves your leagues, every lineup that needs you, and what Vegas thinks — all your Sleeper leagues at once.
          </Text>

          <Text className="mb-2 mt-8 text-[11px] font-semibold uppercase tracking-widest text-night-500">Sleeper username</Text>
          <View className="flex-row items-center rounded-2xl border border-night-700 bg-night-900 px-4">
            <SymbolView name="at" size={16} tintColor={colors.night500} />
            <TextInput
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setError(null);
              }}
              onSubmitEditing={() => void search()}
              placeholder="your username"
              placeholderTextColor={colors.night500}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="search"
              className="ml-2 flex-1 py-3.5 text-[16px] text-night-100"
            />
          </View>
          <Text className="mt-2 text-[12px] text-night-500">No password, ever. Night Owl only reads public league data.</Text>
          {error ? <Text className="mt-2 text-[13px] text-delta-neg">{error}</Text> : null}
          <View className="mt-4">
            <PrimaryButton label="Sync My Sleeper Leagues" onPress={() => void search()} disabled={!username.trim()} loading={searching} />
          </View>

          {found ? (
            <>
              <View className="mt-8 flex-row items-center">
                {avatarUrl(found.avatar) ? <Image source={{ uri: avatarUrl(found.avatar) ?? '' }} style={{ width: 28, height: 28, borderRadius: 14 }} /> : null}
                <Text className="ml-2 text-[15px] font-semibold text-night-100">{found.display_name}</Text>
              </View>
              <Text className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-widest text-night-500">Season</Text>
              <View className="flex-row">
                {seasons.map((s) => (
                  <Chip key={s} label={s} active={season === s} onPress={() => setSeason(s)} />
                ))}
              </View>
              <View className="mb-2 mt-6 flex-row items-center justify-between">
                <Text className="text-[11px] font-semibold uppercase tracking-widest text-night-500">
                  Leagues {leagues.length ? `· ${chosen.length} of ${leagues.length}` : ''}
                </Text>
                {leagues.length > 1 ? (
                  <Pressable onPress={() => setSelected(chosen.length === leagues.length ? new Set() : null)}>
                    <Text className="text-[13px] font-semibold text-owl-cyan">{chosen.length === leagues.length ? 'None' : 'All'}</Text>
                  </Pressable>
                ) : null}
              </View>
              {leaguesQuery.isLoading ? <Text className="text-[13px] text-night-500">Finding your leagues…</Text> : null}
              {leaguesQuery.isError ? <Text className="text-[13px] text-delta-neg">Couldn't load leagues. Pull to retry.</Text> : null}
              {!leaguesQuery.isLoading && !leagues.length && !leaguesQuery.isError ? (
                <Text className="text-[13px] text-night-500">No {season} leagues on this account yet.</Text>
              ) : null}
              {leagues.map((l) => (
                <LeagueRow
                  key={l.league_id}
                  league={l}
                  on={isOn(l.league_id)}
                  weight={weights[l.league_id] ?? 1}
                  onToggle={() => toggle(l.league_id)}
                  onWeight={(w) => setWeights({ ...weights, [l.league_id]: w })}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
        {found && chosen.length ? (
          <View className="absolute bottom-0 left-0 right-0 border-t border-night-800 bg-night-950 px-5 pb-8 pt-3">
            <PrimaryButton label={`Continue with ${chosen.length} ${chosen.length === 1 ? 'league' : 'leagues'}`} onPress={finish} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
