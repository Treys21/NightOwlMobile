// Color-coded status pill: Q, D, OUT, IR, PUP, SUS, BYE.
import { Text, View } from 'react-native';
import type { InjuryStatus } from '@nightowl/core';
import { colors } from '../../theme';

const LABEL: Record<string, { text: string; color: string }> = {
  Questionable: { text: 'Q', color: colors.warn },
  Doubtful: { text: 'D', color: colors.neg },
  Out: { text: 'OUT', color: colors.neg },
  IR: { text: 'IR', color: colors.neg },
  PUP: { text: 'PUP', color: colors.neg },
  Sus: { text: 'SUS', color: colors.neg },
  NA: { text: 'NA', color: colors.night500 },
  Cov: { text: 'COV', color: colors.neg }
};

export function InjuryBadge({ status, bye }: { status: InjuryStatus | string | null; bye?: boolean }) {
  const info = bye ? { text: 'BYE', color: colors.neg } : status ? LABEL[status] : undefined;
  if (!info) return null;
  return (
    <View className="ml-1.5 rounded px-1 py-px" style={{ backgroundColor: `${info.color}26` }} accessibilityLabel={bye ? 'On bye' : String(status)}>
      <Text className="text-[10px] font-bold" style={{ color: info.color }}>
        {info.text}
      </Text>
    </View>
  );
}
