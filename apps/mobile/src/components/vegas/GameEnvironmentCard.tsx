// A game's betting environment: spread, total, each team's implied points,
// and whether it's indoors.
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';
import { teamLogoUrl } from '@nightowl/core';
import type { GameEnvironmentOdds } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { kickoffLabel } from '../../utils/format';

function TeamLine({ team, implied, spread }: { team: string; implied: number; spread: number }) {
  return (
    <View className="flex-row items-center py-1">
      <Image source={{ uri: teamLogoUrl(team) }} cachePolicy="disk" style={{ width: 22, height: 22 }} contentFit="contain" />
      <Text className="ml-2 w-11 text-[14px] font-semibold text-night-100">{team}</Text>
      <Text className="w-14 text-[13px] text-night-300" style={tabular}>
        {spread === 0 ? 'PK' : spread > 0 ? `+${spread}` : `${spread}`}
      </Text>
      <View className="ml-auto flex-row items-baseline">
        <Text className="text-[16px] font-bold text-night-100" style={tabular}>
          {implied.toFixed(1)}
        </Text>
        <Text className="ml-1 text-[11px] text-night-500">pts</Text>
      </View>
    </View>
  );
}

export function GameEnvironmentCard({ game }: { game: GameEnvironmentOdds }) {
  const shootout = game.overUnderTotal >= 48;
  return (
    <View className="mb-2 rounded-2xl border border-night-700 bg-night-900 px-3 py-2.5">
      <View className="mb-1 flex-row items-center">
        <Text className="text-[12px] text-night-500">{kickoffLabel(Date.parse(game.commenceTimeIso))}</Text>
        <View className="ml-auto flex-row items-center">
          {game.isDome ? (
            <View className="mr-2 flex-row items-center rounded bg-night-800 px-1.5 py-0.5">
              <SymbolView name="building.columns.fill" size={10} tintColor={colors.night300} />
              <Text className="ml-1 text-[10px] font-semibold text-night-300">DOME</Text>
            </View>
          ) : null}
          <Text className="text-[12px] font-semibold" style={[{ color: shootout ? colors.pos : colors.night300 }, tabular]}>
            O/U {game.overUnderTotal}
          </Text>
        </View>
      </View>
      <TeamLine team={game.awayTeam} implied={game.awayImpliedTotal} spread={-game.homeSpread} />
      <TeamLine team={game.homeTeam} implied={game.homeImpliedTotal} spread={game.homeSpread} />
    </View>
  );
}
