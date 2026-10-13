// Lineups are edited in Sleeper: this jumps straight to the league.
import { SymbolView } from 'expo-symbols';
import { Pressable, Text } from 'react-native';
import { colors } from '../../theme';
import { openSleeperLeague } from '../../utils/deepLinks';

export function OpenSleeperButton({ leagueId, label = 'Open in Sleeper', compact }: { leagueId: string; label?: string; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void openSleeperLeague(leagueId)}
      className={`flex-row items-center self-start rounded-full border border-owl-cyan/40 bg-owl-cyan/10 ${compact ? 'px-2.5 py-1' : 'px-3.5 py-1.5'}`}
    >
      <Text className={`font-semibold text-owl-cyan ${compact ? 'text-[12px]' : 'text-[13px]'}`}>{label}</Text>
      <SymbolView name="arrow.up.right" size={compact ? 10 : 12} tintColor={colors.cyan} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}
