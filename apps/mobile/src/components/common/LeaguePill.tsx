// "+7.4 pts • Main Dynasty" (green) or "−6.9 vs @Mike • Work League" (red).
import { Text, View } from 'react-native';
import type { ImpactPerspective } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { signedPts } from '../../utils/format';

const TONE: Record<ImpactPerspective, string> = {
  FOR_USER: colors.pos,
  AGAINST_USER: colors.neg,
  USER_BENCH: colors.night500,
  CONFLICT_BOTH: colors.warn
};

export function LeaguePill({ leagueName, points, perspective, opponent }: { leagueName: string; points: number; perspective: ImpactPerspective; opponent?: string | null }) {
  const tone = TONE[perspective];
  const shown = perspective === 'AGAINST_USER' ? -points : points;
  const suffix = perspective === 'USER_BENCH' ? ' bench' : perspective === 'CONFLICT_BOTH' ? ' both sides' : perspective === 'AGAINST_USER' && opponent ? ` vs ${opponent}` : '';
  return (
    <View className="mb-1.5 mr-1.5 flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: `${tone}1F` }}>
      <Text className="text-[12px] font-bold" style={[{ color: tone }, tabular]}>
        {signedPts(shown)}
      </Text>
      <Text numberOfLines={1} className="ml-1 max-w-[180px] text-[12px] text-night-300">
        {suffix ? `${suffix.trim()} · ` : ''}
        {leagueName}
      </Text>
    </View>
  );
}
