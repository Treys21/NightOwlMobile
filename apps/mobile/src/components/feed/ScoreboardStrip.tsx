// Every matchup at a glance: a horizontal strip of 136 pt cards, top edge
// green when winning, red when losing. Tap one to filter the feed to it.
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { LiveMatchupSummary } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { pts, signedPts } from '../../utils/format';

export function ScoreboardStrip({ summaries, selected, onSelect }: { summaries: LiveMatchupSummary[]; selected: string | null; onSelect: (leagueId: string | null) => void }) {
  if (!summaries.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, alignItems: 'flex-start' }}>
      {summaries.map((m) => {
        const notStarted = m.userPoints === 0 && m.opponentPoints === 0;
        const tone = m.opponentRosterId === null || m.isTied ? colors.night500 : m.isWinning ? colors.pos : colors.neg;
        const on = selected === m.leagueId;
        return (
          <Pressable
            key={m.leagueId}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${m.leagueName}: ${pts(m.userPoints)} to ${pts(m.opponentPoints)}`}
            onPress={() => {
              void Haptics.selectionAsync();
              onSelect(on ? null : m.leagueId);
            }}
            style={{ width: 136, borderTopColor: tone, borderColor: on ? colors.night300 : colors.night700 }}
            className="mr-2 overflow-hidden rounded-xl border border-t-[3px] bg-night-900 px-3 py-2"
          >
            <Text numberOfLines={1} className="text-[11px] font-semibold text-night-300">
              {m.leagueName}
            </Text>
            <View className="mt-1 flex-row items-baseline justify-between">
              <Text className="text-[17px] font-bold text-night-100" style={tabular}>
                {pts(m.userPoints)}
              </Text>
              <Text className="text-[13px] text-night-500" style={tabular}>
                {m.opponentRosterId === null ? 'bye' : pts(m.opponentPoints)}
              </Text>
            </View>
            {m.opponentRosterId !== null ? (
              <Text className="mt-0.5 text-[11px] font-semibold" style={[{ color: tone }, tabular]}>
                {notStarted ? 'Not started' : m.isTied ? 'Tied' : signedPts(m.pointDifferential)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
