// A starter Vegas likes less than a bench teammate who can take the slot.
import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';
import type { LineupActionAlert } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { signedPts } from '../../utils/format';
import { PlayerAvatar } from '../common/PlayerAvatar';
import { OpenSleeperButton } from '../lineups/OpenSleeperButton';

export function PropUpgradeCard({ alert, starterPoints, benchPoints }: { alert: LineupActionAlert; starterPoints: number | null; benchPoints: number | null }) {
  const swap = alert.recommendedSwapPlayer;
  if (!swap) return null;
  return (
    <View className="mr-3 w-[280px] rounded-2xl border border-owl-cyan/30 bg-night-900 p-3">
      <Text numberOfLines={1} className="text-[12px] font-semibold text-night-300">
        {alert.leagueName} · {alert.assignedSlot}
      </Text>
      <View className="mt-3 flex-row items-center">
        <View className="flex-1 items-center">
          <PlayerAvatar playerId={alert.starterPlayer.player_id} team={alert.starterPlayer.team} size={40} />
          <Text numberOfLines={1} className="mt-1.5 text-[13px] font-semibold text-night-300">
            {alert.starterPlayer.last_name || alert.starterPlayer.full_name}
          </Text>
          <Text className="text-[15px] font-bold text-night-300" style={tabular}>
            {starterPoints?.toFixed(1) ?? '—'}
          </Text>
        </View>
        <SymbolView name="arrow.right" size={16} tintColor={colors.cyan} />
        <View className="flex-1 items-center">
          <PlayerAvatar playerId={swap.player_id} team={swap.team} size={40} ring={colors.cyan} />
          <Text numberOfLines={1} className="mt-1.5 text-[13px] font-semibold text-night-100">
            {swap.last_name || swap.full_name}
          </Text>
          <Text className="text-[15px] font-bold text-owl-cyan" style={tabular}>
            {benchPoints?.toFixed(1) ?? '—'}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-[13px] font-bold text-delta-pos" style={tabular}>
          {alert.projectedPointGain !== null ? `${signedPts(alert.projectedPointGain)} implied` : ''}
        </Text>
        <OpenSleeperButton leagueId={alert.leagueId} label="Swap" compact />
      </View>
    </View>
  );
}
