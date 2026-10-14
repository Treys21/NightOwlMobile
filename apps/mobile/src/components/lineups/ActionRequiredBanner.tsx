// Starters who need attention before lock: red for Out / IR / bye, amber for
// game-time decisions, cyan for a bench player Vegas likes more. Collapses
// to a count when there are many.
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LineupActionAlert, LineupAlertSeverity } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { signedPts } from '../../utils/format';
import { InjuryBadge } from '../common/InjuryBadge';
import { PlayerAvatar } from '../common/PlayerAvatar';
import { OpenSleeperButton } from './OpenSleeperButton';

const TONE: Record<LineupAlertSeverity, string> = { CRITICAL: colors.neg, WARNING: colors.warn, VEGAS_UPGRADE: colors.cyan };
const COLLAPSED = 3;

function AlertCard({ alert }: { alert: LineupActionAlert }) {
  const tone = TONE[alert.severity];
  const swap = alert.recommendedSwapPlayer;
  return (
    <View className="mb-2 rounded-2xl border bg-night-900 p-3" style={{ borderColor: `${tone}66`, borderLeftWidth: 3, borderLeftColor: tone }}>
      <View className="flex-row items-center">
        <PlayerAvatar playerId={alert.starterPlayer.player_id} team={alert.starterPlayer.team} size={36} />
        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text numberOfLines={1} className="shrink text-[15px] font-semibold text-night-100">
              {alert.starterPlayer.full_name}
            </Text>
            <InjuryBadge status={alert.starterPlayer.injury_status} bye={alert.reason.includes('bye')} />
          </View>
          <Text numberOfLines={1} className="text-[12px] text-night-300">
            {alert.assignedSlot} · {alert.leagueName}
          </Text>
        </View>
      </View>
      <Text className="mt-2 text-[13px] font-semibold" style={{ color: tone }}>
        {alert.reason}
      </Text>
      {swap ? (
        <Text className="mt-0.5 text-[13px] text-night-300" style={tabular}>
          Swap in <Text className="font-semibold text-night-100">{swap.full_name}</Text>
          {alert.projectedPointGain !== null ? ` (${signedPts(alert.projectedPointGain)} Vegas pts)` : ''}
        </Text>
      ) : alert.severity === 'CRITICAL' ? (
        <Text className="mt-0.5 text-[13px] text-night-300">No healthy bench player fits this slot: check waivers.</Text>
      ) : null}
      <View className="mt-2.5">
        <OpenSleeperButton leagueId={alert.leagueId} label="Fix in Sleeper" compact />
      </View>
    </View>
  );
}

export function ActionRequiredBanner({ alerts }: { alerts: LineupActionAlert[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts.length) return null;
  const critical = alerts.filter((a) => a.severity === 'CRITICAL').length;
  const shown = expanded ? alerts : alerts.slice(0, COLLAPSED);
  return (
    <View className="px-4">
      <View className="mb-2 flex-row items-center">
        <SymbolView name={critical ? 'exclamationmark.octagon.fill' : 'bell.badge.fill'} size={16} tintColor={critical ? colors.neg : colors.warn} />
        <Text className="ml-2 text-[15px] font-bold text-night-100">
          {alerts.length} {alerts.length === 1 ? 'starter needs' : 'starters need'} a look
        </Text>
      </View>
      {shown.map((a) => (
        <AlertCard key={a.alertId} alert={a} />
      ))}
      {alerts.length > COLLAPSED ? (
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setExpanded(!expanded);
          }}
          className="items-center py-2"
        >
          <Text className="text-[13px] font-semibold text-owl-cyan">{expanded ? 'Show fewer' : `Show all ${alerts.length}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
