// Bottom drawer: best available by Sleeper rank, each with how much of the
// user's other leagues already roster him. Drag the handle or tap to open.
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Pressable, Text, View } from 'react-native';
import type { AvailablePlayer } from '../../hooks/useDraftSync';
import { DRAFT_POSITIONS } from '../../hooks/useDraftSync';
import { colors, tabular } from '../../theme';
import { percent } from '../../utils/format';
import { Chip, ChipRow } from '../common/ui';
import { InjuryBadge } from '../common/InjuryBadge';
import { PlayerAvatar } from '../common/PlayerAvatar';

const COLLAPSED = 86;
const EXPANDED = 470;

function exposureTone(share: number): string {
  if (share >= 0.5) return colors.warn;
  if (share > 0) return colors.cyan;
  return colors.night500;
}

export function ExposureDrawer({ players, filter, onFilter, counted }: { players: AvailablePlayer[]; filter: string; onFilter: (pos: string) => void; counted: number }) {
  const height = useRef(new Animated.Value(COLLAPSED)).current;
  const [open, setOpen] = useState(false);
  const start = useRef(COLLAPSED);

  const snap = (to: boolean): void => {
    setOpen(to);
    void Haptics.selectionAsync();
    Animated.spring(height, { toValue: to ? EXPANDED : COLLAPSED, useNativeDriver: false, bounciness: 4 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        height.stopAnimation((v) => {
          start.current = v;
        });
      },
      onPanResponderMove: (_, g) => height.setValue(Math.max(COLLAPSED, Math.min(EXPANDED, start.current - g.dy))),
      onPanResponderRelease: (_, g) => snap(start.current - g.dy > (COLLAPSED + EXPANDED) / 2 || g.vy < -0.5)
    })
  ).current;

  return (
    <Animated.View style={{ height, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} className="absolute bottom-0 left-0 right-0 border border-night-700 bg-night-900">
      <View {...pan.panHandlers}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => snap(!open)} className="items-center pb-2 pt-2.5">
          <View className="h-1 w-10 rounded-full bg-night-700" />
          <View className="mt-2 w-full flex-row items-center justify-between px-4">
            <Text className="text-[15px] font-bold text-night-100">Best available</Text>
            <Text className="text-[12px] text-night-500">{counted ? `Exposure across ${counted} other ${counted === 1 ? 'league' : 'leagues'}` : 'No other leagues synced'}</Text>
          </View>
        </Pressable>
      </View>
      <View className="mb-1">
        <ChipRow>
          {DRAFT_POSITIONS.map((p) => (
            <Chip key={p} label={p === 'ALL' ? 'All' : p} active={filter === p} onPress={() => onFilter(p)} tone={colors.position[p]} />
          ))}
        </ChipRow>
      </View>
      <FlatList
        data={players}
        keyExtractor={(a) => a.player.player_id}
        renderItem={({ item, index }) => {
          const share = item.exposure.portfolioShare;
          const tone = exposureTone(share);
          return (
            <View className="flex-row items-center border-b border-night-800 px-4 py-2">
              <Text className="w-6 text-[12px] text-night-500" style={tabular}>
                {index + 1}
              </Text>
              <PlayerAvatar playerId={item.player.player_id} team={item.player.team} size={32} />
              <View className="ml-3 flex-1">
                <View className="flex-row items-center">
                  <Text numberOfLines={1} className="shrink text-[14px] font-semibold text-night-100">
                    {item.player.full_name}
                  </Text>
                  <InjuryBadge status={item.player.injury_status} />
                </View>
                <Text className="text-[12px]" style={{ color: colors.position[item.player.position] ?? colors.night300 }}>
                  {item.player.position} <Text className="text-night-500">· {item.player.team ?? 'FA'}</Text>
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[14px] font-bold" style={[{ color: tone }, tabular]}>
                  {percent(share)}
                </Text>
                <Text className="text-[10px] text-night-500" style={tabular}>
                  {item.exposure.leaguesOwned}/{item.exposure.leaguesCounted} owned
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text className="px-4 py-6 text-center text-[13px] text-night-500">Loading players…</Text>}
      />
    </Animated.View>
  );
}
