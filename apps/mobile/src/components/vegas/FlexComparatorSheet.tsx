// Player A vs Player B on what the books say: implied points, game
// environment, yardage and reception lines, and touchdown odds. Either side
// can be swapped from a sheet of the user's players who have lines.
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { devigTwoWay, formatAmerican, impliedTeamTotal } from '@nightowl/core';
import type { PlayerVegasProjection, SlimNflPlayer } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { percent } from '../../utils/format';
import { PlayerAvatar } from '../common/PlayerAvatar';

export interface ComparatorCandidate {
  player: SlimNflPlayer;
  projection: PlayerVegasProjection;
  /** "Starter" / "Bench" in the selected league or across the portfolio. */
  role: string;
}

type Row = { label: string; a: string; b: string; better: 'a' | 'b' | null };

const spreadFor = (p: PlayerVegasProjection): number | null => {
  const env = p.gameEnvironment;
  if (!env) return null;
  return p.props.teamAbbr === env.homeTeam ? env.homeSpread : -env.homeSpread;
};

const tdChance = (p: PlayerVegasProjection): number => p.props.anytimeTdFairProbability || 0;

function rows(a: PlayerVegasProjection, b: PlayerVegasProjection): Row[] {
  const cmp = (x: number | null, y: number | null, higher = true): 'a' | 'b' | null =>
    x === null || y === null || x === y ? null : (higher ? x > y : x < y) ? 'a' : 'b';
  const num = (v: number | null, digits = 1): string => (v === null ? '—' : v.toFixed(digits));
  const teamPts = (p: PlayerVegasProjection): number | null => (p.gameEnvironment ? impliedTeamTotal(p.gameEnvironment, p.props.teamAbbr) : null);
  const yards = (p: PlayerVegasProjection): number | null => {
    const r = (p.props.rushYdsLine ?? 0) + (p.props.recYdsLine ?? 0);
    return p.props.rushYdsLine === null && p.props.recYdsLine === null ? null : r;
  };
  const overPct = (p: PlayerVegasProjection): number | null =>
    p.props.recOverOdds !== null && p.props.recUnderOdds !== null ? devigTwoWay(p.props.recOverOdds, p.props.recUnderOdds) : null;
  const spread = (p: PlayerVegasProjection): string => {
    const s = spreadFor(p);
    return s === null ? '—' : s === 0 ? 'PK' : s > 0 ? `+${s}` : `${s}`;
  };
  return [
    { label: 'Game total', a: num(a.gameEnvironment?.overUnderTotal ?? null), b: num(b.gameEnvironment?.overUnderTotal ?? null), better: cmp(a.gameEnvironment?.overUnderTotal ?? null, b.gameEnvironment?.overUnderTotal ?? null) },
    { label: 'Spread', a: spread(a), b: spread(b), better: cmp(spreadFor(a), spreadFor(b), false) },
    { label: 'Team implied pts', a: num(teamPts(a)), b: num(teamPts(b)), better: cmp(teamPts(a), teamPts(b)) },
    { label: 'Rush + rec yds line', a: num(yards(a)), b: num(yards(b)), better: cmp(yards(a), yards(b)) },
    { label: 'Receptions line', a: num(a.props.recLine), b: num(b.props.recLine), better: cmp(a.props.recLine, b.props.recLine) },
    { label: 'Fair over %', a: overPct(a) === null ? '—' : percent(overPct(a) ?? 0), b: overPct(b) === null ? '—' : percent(overPct(b) ?? 0), better: cmp(overPct(a), overPct(b)) },
    { label: 'Anytime TD odds', a: formatAmerican(a.props.anytimeTdAmericanOdds), b: formatAmerican(b.props.anytimeTdAmericanOdds), better: null },
    { label: 'TD chance (no vig)', a: tdChance(a) ? percent(tdChance(a)) : '—', b: tdChance(b) ? percent(tdChance(b)) : '—', better: cmp(tdChance(a) || null, tdChance(b) || null) }
  ];
}

function Side({ c, winner, onPress }: { c: ComparatorCandidate | null; winner: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Choose player" onPress={onPress} className={`flex-1 items-center rounded-2xl border p-3 ${winner ? 'border-delta-pos/50 bg-delta-pos/10' : 'border-night-700 bg-night-900'}`}>
      {c ? (
        <>
          <PlayerAvatar playerId={c.player.player_id} team={c.player.team} size={48} />
          <Text numberOfLines={1} className="mt-2 text-[14px] font-semibold text-night-100">
            {c.player.full_name}
          </Text>
          <Text className="text-[11px] text-night-500">
            {c.player.position} · {c.role}
          </Text>
          <Text className="mt-1.5 text-[24px] font-bold" style={[{ color: winner ? colors.pos : colors.night100 }, tabular]}>
            {c.projection.impliedFantasyPoints.toFixed(1)}
          </Text>
          <Text className="text-[10px] font-semibold tracking-wider text-night-500">IMPLIED PTS</Text>
          {winner ? (
            <View className="mt-1.5 rounded-full bg-delta-pos px-2 py-0.5">
              <Text className="text-[10px] font-bold text-night-950">START</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View className="h-[150px] items-center justify-center">
          <SymbolView name="plus.circle" size={26} tintColor={colors.night500} />
          <Text className="mt-2 text-[13px] text-night-500">Pick a player</Text>
        </View>
      )}
      <Text className="mt-2 text-[11px] font-semibold text-owl-cyan">Change</Text>
    </Pressable>
  );
}

function Picker({ visible, candidates, onPick, onClose }: { visible: boolean; candidates: ComparatorCandidate[]; onPick: (c: ComparatorCandidate) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return candidates.filter((c) => !s || c.player.full_name.toLowerCase().includes(s));
  }, [candidates, q]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-night-950" edges={['top']}>
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-[17px] font-bold text-night-100">Choose a player</Text>
          <Pressable onPress={onClose}>
            <Text className="text-[15px] font-semibold text-owl-cyan">Done</Text>
          </Pressable>
        </View>
        <View className="mx-4 mb-2 flex-row items-center rounded-xl border border-night-700 bg-night-900 px-3">
          <SymbolView name="magnifyingglass" size={14} tintColor={colors.night500} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={colors.night500} autoCorrect={false} className="ml-2 flex-1 py-2.5 text-[15px] text-night-100" />
        </View>
        <FlatList
          data={list}
          keyExtractor={(c) => c.player.player_id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                onPick(item);
              }}
              className="flex-row items-center border-b border-night-800 px-4 py-2.5"
            >
              <PlayerAvatar playerId={item.player.player_id} team={item.player.team} size={34} />
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-semibold text-night-100">{item.player.full_name}</Text>
                <Text className="text-[12px] text-night-500">
                  {item.player.position} · {item.player.team ?? 'FA'} · {item.role}
                </Text>
              </View>
              <Text className="text-[15px] font-bold text-night-100" style={tabular}>
                {item.projection.impliedFantasyPoints.toFixed(1)}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text className="px-4 py-8 text-center text-[14px] text-night-500">None of your players have lines yet.</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

export function FlexComparatorSheet({ candidates, defaultA, defaultB }: { candidates: ComparatorCandidate[]; defaultA: ComparatorCandidate | null; defaultB: ComparatorCandidate | null }) {
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const find = (id: string | null): ComparatorCandidate | null => (id ? (candidates.find((c) => c.player.player_id === id) ?? null) : null);
  const a = find(aId) ?? defaultA;
  const b = find(bId) ?? defaultB;
  const winner = a && b ? (a.projection.impliedFantasyPoints >= b.projection.impliedFantasyPoints ? 'a' : 'b') : null;

  return (
    <View className="px-4">
      <View className="flex-row">
        <Side c={a} winner={winner === 'a'} onPress={() => setPicking('a')} />
        <View className="w-8 items-center justify-center">
          <Text className="text-[12px] font-bold text-night-500">VS</Text>
        </View>
        <Side c={b} winner={winner === 'b'} onPress={() => setPicking('b')} />
      </View>
      {a && b ? (
        <View className="mt-3 rounded-2xl border border-night-700 bg-night-900 px-3 py-1">
          {rows(a.projection, b.projection).map((r) => (
            <View key={r.label} className="flex-row items-center border-b border-night-800 py-2 last:border-b-0">
              <Text className="flex-1 text-right text-[14px] font-semibold" style={[{ color: r.better === 'a' ? colors.pos : colors.night100 }, tabular]}>
                {r.a}
              </Text>
              <Text className="w-36 text-center text-[11px] text-night-500">{r.label}</Text>
              <Text className="flex-1 text-[14px] font-semibold" style={[{ color: r.better === 'b' ? colors.pos : colors.night100 }, tabular]}>
                {r.b}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Picker
        visible={picking !== null}
        candidates={candidates}
        onClose={() => setPicking(null)}
        onPick={(c) => {
          if (picking === 'a') setAId(c.player.player_id);
          else setBId(c.player.player_id);
          setPicking(null);
        }}
      />
    </View>
  );
}
