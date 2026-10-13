// One play: game context on top, the play with the main player's headshot,
// and what it did in each league underneath, netted on the right.
import { Image } from 'expo-image';
import { memo, useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { teamLogoUrl } from '@nightowl/core';
import type { EnrichedPlayEvent, SlimNflPlayer } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import { gameClock, signedPts } from '../../utils/format';
import { LeaguePill } from '../common/LeaguePill';
import { PlayerAvatar } from '../common/PlayerAvatar';

function RedZoneBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ opacity: pulse }} className="ml-2 rounded bg-delta-neg/20 px-1.5 py-0.5">
      <Text className="text-[10px] font-bold tracking-wider text-delta-neg">RED ZONE</Text>
    </Animated.View>
  );
}

/** Bold the player names that appear in the play text. */
function Description({ text, names }: { text: string; names: string[] }) {
  const lastNames = names.map((n) => n.split(' ').slice(1).join(' ')).filter((n) => n.length > 2);
  if (!lastNames.length) return <Text className="text-[14px] leading-5 text-night-100">{text}</Text>;
  const pattern = new RegExp(`(\\b[A-Z][a-z]?\\.\\s?(?:${lastNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b)`, 'g');
  const parts = text.split(pattern);
  return (
    <Text className="text-[14px] leading-5 text-night-100">
      {parts.map((part, i) => (i % 2 === 1 ? <Text key={i} className="font-bold">{part}</Text> : part))}
    </Text>
  );
}

function Logo({ team }: { team: string }) {
  return team ? <Image source={{ uri: teamLogoUrl(team) }} cachePolicy="disk" style={{ width: 18, height: 18 }} contentFit="contain" /> : null;
}

export const PlayEventCard = memo(function PlayEventCard({ event, playerOf }: { event: EnrichedPlayEvent; playerOf: (id: string) => SlimNflPlayer | null }) {
  const net = event.totalNetPointsForUser;
  const tone = net > 0 ? colors.pos : net < 0 ? colors.neg : colors.night500;
  const lead = event.leagueImpacts[0]?.playerId ?? event.involvedPlayerIds[0] ?? '';
  const leadPlayer = playerOf(lead);
  const names = [...new Set(event.leagueImpacts.map((i) => i.playerName))];
  const clock = gameClock(event.quarter, event.clock);

  return (
    <View className="mx-4 mb-3 rounded-2xl border border-night-700 bg-night-900 p-3" style={{ borderLeftWidth: 3, borderLeftColor: tone }}>
      <View className="flex-row items-center">
        <Logo team={event.awayTeam} />
        {event.quarter ? (
          <Text className="ml-1 text-[12px] font-semibold text-night-300" style={tabular}>
            {event.awayScore}–{event.homeScore}
          </Text>
        ) : null}
        {event.homeTeam ? <View className="ml-1"><Logo team={event.homeTeam} /></View> : null}
        <Text numberOfLines={1} className="ml-2 flex-1 text-[12px] text-night-500" style={tabular}>
          {[clock, event.downAndDistance].filter(Boolean).join(' · ')}
        </Text>
        {event.isRedZonePlay ? <RedZoneBadge /> : null}
        {event.isStatCorrectionOrReversal ? (
          <View className="ml-2 rounded bg-delta-warn/20 px-1.5 py-0.5">
            <Text className="text-[10px] font-bold text-delta-warn">CORRECTION</Text>
          </View>
        ) : null}
      </View>

      <View className="mt-2.5 flex-row">
        {lead ? <PlayerAvatar playerId={lead} team={leadPlayer?.team ?? null} size={40} /> : null}
        <View className="ml-3 flex-1">
          <Description text={event.description} names={names} />
        </View>
      </View>

      <View className="mt-2.5 flex-row items-end">
        <View className="flex-1 flex-row flex-wrap">
          {event.leagueImpacts.map((i) => (
            <LeaguePill key={`${i.leagueId}:${i.playerId}`} leagueName={i.leagueName} points={i.pointsDelta} perspective={i.perspective} opponent={i.opponentName} />
          ))}
        </View>
        <View className="mb-1.5 ml-2 rounded-lg px-2 py-1" style={{ backgroundColor: `${tone}26` }}>
          <Text className="text-[13px] font-bold" style={[{ color: tone }, tabular]}>
            Net {signedPts(net)}
          </Text>
        </View>
      </View>
    </View>
  );
});
