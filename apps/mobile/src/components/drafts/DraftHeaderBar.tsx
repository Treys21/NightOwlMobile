// Which draft, where it stands, and a pulsing amber banner when the user is
// on the clock.
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { pickLabel } from '@nightowl/core';
import type { DraftBoardModel, SleeperDraft } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { openSleeperDraft } from '../../utils/deepLinks';
import { kickoffLabel } from '../../utils/format';
import { Chip, ChipRow } from '../common/ui';

const STATUS: Record<string, { text: string; color: string }> = {
  drafting: { text: 'LIVE', color: colors.pos },
  paused: { text: 'PAUSED', color: colors.warn },
  pre_draft: { text: 'UPCOMING', color: colors.night300 },
  complete: { text: 'DONE', color: colors.night500 }
};

function OnTheClock() {
  const glow = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.55, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);
  return (
    <Animated.View style={{ opacity: glow }} className="mx-4 mt-2 flex-row items-center rounded-2xl bg-delta-warn px-4 py-3">
      <SymbolView name="alarm.fill" size={18} tintColor={colors.night950} />
      <Text className="ml-2 text-[16px] font-extrabold text-night-950">You're on the clock</Text>
    </Animated.View>
  );
}

export function DraftHeaderBar({
  drafts,
  selectedId,
  onSelect,
  draft,
  board,
  nameOf
}: {
  drafts: SleeperDraft[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  draft: SleeperDraft | null;
  board: DraftBoardModel | null;
  nameOf: (d: SleeperDraft) => string;
}) {
  const status = draft ? (STATUS[draft.status] ?? STATUS.pre_draft) : null;
  const onClock = board?.onTheClockPickNo ? board.cells[board.onTheClockPickNo - 1] : undefined;
  return (
    <View>
      {drafts.length > 1 ? (
        <View className="mb-2">
          <ChipRow>
            {drafts.map((d) => (
              <Chip key={d.draft_id} label={nameOf(d)} active={d.draft_id === selectedId} onPress={() => onSelect(d.draft_id)} tone={d.status === 'drafting' ? colors.pos : undefined} />
            ))}
          </ChipRow>
        </View>
      ) : null}
      {draft && status ? (
        <View className="mx-4 flex-row items-center rounded-2xl border border-night-700 bg-night-900 px-3 py-2.5">
          <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${status.color}26` }}>
            <Text className="text-[10px] font-bold tracking-wider" style={{ color: status.color }}>
              {status.text}
            </Text>
          </View>
          <Text className="ml-2 flex-1 text-[13px] text-night-300" style={tabular}>
            {draft.status === 'pre_draft'
              ? draft.start_time
                ? `Starts ${kickoffLabel(draft.start_time)}`
                : 'Start time not set'
              : onClock
                ? `Pick ${pickLabel(onClock.round, onClock.pickInRound)}${board?.picksUntilUser ? ` · you're up in ${board.picksUntilUser}` : ''}`
                : `${draft.settings.teams} teams · ${draft.settings.rounds} rounds`}
          </Text>
          <Pressable accessibilityRole="link" accessibilityLabel="Open draft room" onPress={() => void openSleeperDraft(draft.draft_id)} className="flex-row items-center">
            <Text className="text-[13px] font-semibold text-owl-cyan">Draft room</Text>
            <SymbolView name="arrow.up.right" size={11} tintColor={colors.cyan} style={{ marginLeft: 3 }} />
          </Pressable>
        </View>
      ) : null}
      {board?.picksUntilUser === 0 ? <OnTheClock /> : null}
    </View>
  );
}
