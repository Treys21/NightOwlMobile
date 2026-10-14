// Projected playoff bracket: one section per round, favorites advance, each
// side with projected points and its chance to win the game.
import { Text, View } from 'react-native';
import type { BracketMatch, BracketSide, ProjectedBracket } from '@nightowl/core';
import { tabular } from '../../theme';
import { odds } from './format';

function Side({ side, chance, me, nameOf }: { side: BracketSide | null; chance: number | null; me: number | null; nameOf: (id: number) => string }) {
  if (!side) {
    return (
      <View className="flex-row items-center px-3 py-2 opacity-50">
        <Text className="w-5 text-[12px] text-night-500"> </Text>
        <Text className="flex-1 text-[13px] text-night-500">Bye</Text>
      </View>
    );
  }
  const mine = side.rosterId === me;
  return (
    <View className={`flex-row items-center px-3 py-2 ${mine ? 'bg-owl-cyan/10' : ''}`}>
      <Text className="w-5 text-[12px] text-night-500" style={tabular}>
        {side.seed}
      </Text>
      <Text numberOfLines={1} className={`flex-1 text-[14px] ${mine ? 'font-bold text-night-100' : 'text-night-100'}`}>
        {nameOf(side.rosterId)}
      </Text>
      <Text className="w-14 text-right text-[13px] text-night-300" style={tabular}>
        {side.points.toFixed(1)}
      </Text>
      <Text className="w-11 text-right text-[12px] text-night-500" style={tabular}>
        {chance === null ? '' : odds(chance)}
      </Text>
    </View>
  );
}

function Match({ match, me, nameOf }: { match: BracketMatch; me: number | null; nameOf: (id: number) => string }) {
  const both = !!match.top && !!match.bottom;
  return (
    <View className="mb-2 overflow-hidden rounded-xl border border-night-700 bg-night-800/60">
      <Side side={match.top} chance={both ? match.pTop : null} me={me} nameOf={nameOf} />
      <View className="h-px bg-night-700" />
      <Side side={match.bottom} chance={both ? 1 - match.pTop : null} me={me} nameOf={nameOf} />
    </View>
  );
}

export function PlayoffBracket({ bracket, me, nameOf, titleOdds }: { bracket: ProjectedBracket; me: number | null; nameOf: (id: number) => string; titleOdds: (id: number) => number }) {
  const champ = bracket.champion;
  return (
    <View className="px-4">
      {bracket.rounds.map((round) => (
        <View key={round.round} className="mb-1">
          <Text className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-night-500">
            {round.label} · Wk {round.weeks.join('–')}
          </Text>
          {round.matches.map((m, i) => (
            <Match key={i} match={m} me={me} nameOf={nameOf} />
          ))}
        </View>
      ))}
      {champ ? (
        <Text className="px-1 pt-1 text-[12px] leading-4 text-night-500">
          Projected champion: <Text className="font-semibold text-night-100">{nameOf(champ.rosterId)}</Text> ({odds(titleOdds(champ.rosterId))} to win it all)
          {me !== null ? `. You: ${odds(titleOdds(me))}.` : '.'}
        </Text>
      ) : null}
    </View>
  );
}
