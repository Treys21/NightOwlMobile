// Sleeper CDN headshot (cached by expo-image) with a team-logo badge.
import { Image } from 'expo-image';
import { View } from 'react-native';
import { headshotUrl, teamLogoUrl } from '@nightowl/core';
import { colors } from '../../theme';

export function PlayerAvatar({ playerId, team, size = 44, ring }: { playerId: string; team: string | null; size?: number; ring?: string }) {
  const badge = Math.round(size * 0.42);
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={{ uri: headshotUrl(playerId) }}
        cachePolicy="disk"
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.night800, borderWidth: ring ? 2 : 0, borderColor: ring }}
      />
      {team ? (
        <Image
          source={{ uri: teamLogoUrl(team) }}
          cachePolicy="disk"
          contentFit="contain"
          style={{ position: 'absolute', right: -3, bottom: -3, width: badge, height: badge, borderRadius: badge / 2, backgroundColor: colors.night950, borderWidth: 1.5, borderColor: colors.night950 }}
        />
      ) : null}
    </View>
  );
}
