// One player across the portfolio: started, benched, faced, and the net
// leverage. Tap to see every league.
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { memo, useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import type { LeagueExposureContext, PlayerPortfolioEntry } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { percent, pts } from '../../utils/format';
import { InjuryBadge } from '../common/InjuryBadge';
import { PlayerAvatar } from '../common/PlayerAvatar';
import { OpenSleeperButton } from './OpenSleeperButton';

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="ml-2.5 items-center">
      <Text className="text-[15px] font-bold" style={[{ color: value ? color : colors.night700 }, tabular]}>
        {value}
      </Text>
      <Text className="text-[9px] font-semibold tracking-wider text-night-500">{label}</Text>
    </View>
  );
}

function LeagueLine({ ctx, kind }: { ctx: LeagueExposureContext; kind: 'start' | 'bench' | 'stash' | 'vs' }) {
  const tone = kind === 'start' ? colors.pos : kind === 'vs' ? colors.neg : colors.night500;
  const what = kind === 'start' ? `Starting · ${ctx.userAssignedSlot ?? ''}` : kind === 'bench' ? 'Bench' : kind === 'stash' ? (ctx.userSlotCategory === 'TAXI' ? 'Taxi' : 'IR') : `Facing ${ctx.opponentDisplayName ?? ''}`;
  return (
    <View className="flex-row items-center border-t border-night-800 py-2">
      <View className="mr-2.5 h-2 w-2 rounded-full" style={{ backgroundColor: tone }} />
      <View className="flex-1">
        <Text numberOfLines={1} className="text-[13px] font-semibold text-night-100">
          {ctx.leagueName}
        </Text>
        <Text numberOfLines={1} className="text-[12px] text-night-300">
          {what}
          {ctx.playerPointsInLeagueThisWeek ? ` · ${pts(ctx.playerPointsInLeagueThisWeek)} pts` : ''}
        </Text>
      </View>
      <OpenSleeperButton leagueId={ctx.leagueId} label="Open" compact />
    </View>
  );
}

export const PlayerExposureRow = memo(function PlayerExposureRow({ entry, bye }: { entry: PlayerPortfolioEntry; bye: boolean }) {
  const [open, setOpen] = useState(false);
  const p = entry.player;
  const net = entry.netLeverageCount;
  const netTone = net > 0 ? colors.pos : net < 0 ? colors.neg : colors.night500;
  const stash = entry.irOrTaxiInLeagues.length;
  return (
    <View className="mx-4 mb-2 rounded-2xl border border-night-700 bg-night-900">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${p.full_name}, starting ${entry.startedInLeagues.length}, bench ${entry.benchedInLeagues.length}, facing ${entry.facingInLeagues.length}`}
        onPress={() => {
          void Haptics.selectionAsync();
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen(!open);
        }}
        className="flex-row items-center p-3"
      >
        <PlayerAvatar playerId={p.player_id} team={p.team} size={40} ring={entry.isHighConflictPlayer ? colors.warn : undefined} />
        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text numberOfLines={1} className="shrink text-[15px] font-semibold text-night-100">
              {p.full_name}
            </Text>
            <InjuryBadge status={p.injury_status} bye={bye} />
          </View>
          <Text className="text-[12px] text-night-300" style={tabular}>
            {p.position}
            {p.team ? ` · ${p.team}` : ''} · {percent(entry.ownershipShare)} owned
          </Text>
        </View>
        <Counter label="START" value={entry.startedInLeagues.length} color={colors.pos} />
        <Counter label="BENCH" value={entry.benchedInLeagues.length + stash} color={colors.night300} />
        <Counter label="VS" value={entry.facingInLeagues.length} color={colors.neg} />
        <View className="ml-3 min-w-[34px] items-center rounded-lg px-1.5 py-1" style={{ backgroundColor: `${netTone}26` }}>
          <Text className="text-[13px] font-bold" style={[{ color: netTone }, tabular]}>
            {net > 0 ? `+${net}` : net}
          </Text>
        </View>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={colors.night500} style={{ marginLeft: 8 }} />
      </Pressable>
      {open ? (
        <View className="px-3 pb-1">
          {entry.startedInLeagues.map((c) => (
            <LeagueLine key={`s${c.leagueId}`} ctx={c} kind="start" />
          ))}
          {entry.facingInLeagues.map((c) => (
            <LeagueLine key={`v${c.leagueId}`} ctx={c} kind="vs" />
          ))}
          {entry.benchedInLeagues.map((c) => (
            <LeagueLine key={`b${c.leagueId}`} ctx={c} kind="bench" />
          ))}
          {entry.irOrTaxiInLeagues.map((c) => (
            <LeagueLine key={`i${c.leagueId}`} ctx={c} kind="stash" />
          ))}
        </View>
      ) : null}
    </View>
  );
});
