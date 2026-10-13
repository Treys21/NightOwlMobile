// One pick on the board: position-tinted, R.P label, snake/3RR direction
// arrow, the player, and a gold ring on the user's own picks.
import { memo, useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { pickLabel } from '@nightowl/core';
import type { DraftBoardCellModel } from '@nightowl/core';
import { colors, tabular } from '../../theme';

export const CELL_WIDTH = 96;
export const CELL_HEIGHT = 66;
const GOLD = '#FACC15';

function ClockPulse() {
  const pulse = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: 650, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 10, backgroundColor: colors.warn, opacity: pulse }} />;
}

export const DraftGridCell = memo(function DraftGridCell({ cell, mine }: { cell: DraftBoardCellModel; mine: boolean }) {
  const pick = cell.pick;
  const pos = pick?.metadata.position ?? '';
  const tint = colors.position[pos] ?? colors.night700;
  return (
    <View
      style={{
        width: CELL_WIDTH - 4,
        height: CELL_HEIGHT - 4,
        margin: 2,
        borderRadius: 10,
        backgroundColor: pick ? `${tint}29` : cell.isUserSlot ? colors.night800 : colors.night900,
        borderWidth: mine ? 2 : 1,
        borderColor: mine ? GOLD : pick ? `${tint}66` : colors.night800
      }}
      className="overflow-hidden px-1.5 py-1"
      accessibilityLabel={pick ? `Pick ${pickLabel(cell.round, cell.pickInRound)}: ${pick.metadata.first_name} ${pick.metadata.last_name}` : `Pick ${pickLabel(cell.round, cell.pickInRound)}`}
    >
      {cell.isOnTheClock ? <ClockPulse /> : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] font-semibold text-night-500" style={tabular}>
          {pickLabel(cell.round, cell.pickInRound)}
        </Text>
        <Text className="text-[10px] text-night-500">{cell.directionArrow === 'RIGHT' ? '→' : '←'}</Text>
      </View>
      {pick ? (
        <>
          <Text numberOfLines={1} className="mt-0.5 text-[13px] font-bold text-night-100">
            {pick.metadata.last_name}
          </Text>
          <Text numberOfLines={1} className="text-[11px] text-night-300">
            {pick.metadata.first_name.charAt(0)}. · <Text style={{ color: tint }} className="font-bold">{pos}</Text> {pick.metadata.team}
          </Text>
        </>
      ) : cell.isOnTheClock ? (
        <Text className="mt-2 text-[11px] font-bold text-delta-warn">ON CLOCK</Text>
      ) : null}
    </View>
  );
});
