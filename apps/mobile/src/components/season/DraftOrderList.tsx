// Next year's draft order (keeper and dynasty leagues): worst first by 30%
// wins + 70% max points, now or on projected end-of-season numbers.
import { Text, View } from 'react-native';
import { DRAFT_WIN_WEIGHT, draftOrder, projectedDraft } from '@nightowl/core';
import type { SeasonProjection } from '@nightowl/core';
import { tabular } from '../../theme';
import type { DraftMethod, SeasonLeague } from '../../hooks/useSeason';
import { odds, pickLabel } from './format';

interface PickRow {
  rosterId: number;
  pick: number;
  wins: number;
  max: number | null;
  extra: string;
}

export function DraftOrderList({ view, projection, method }: { view: SeasonLeague; projection: SeasonProjection | null; method: DraftMethod }) {
  const draft = view.draft;
  if (!draft) return null;
  const rows: PickRow[] = projection
    ? projectedDraft(projection, { method }).map((p) => ({ rosterId: p.rosterId, pick: p.pick, wins: p.wins, max: p.max, extra: p.odds ? odds(p.odds[0] ?? 0) : '–' }))
    : draftOrder(view.rows.map((r) => ({ rosterId: r.rosterId, wins: r.wins + r.ties / 2, max: r.max })), { method }).map((p) => ({
        rosterId: p.rosterId,
        pick: p.pick,
        wins: p.wins,
        max: p.max,
        extra: p.score.toFixed(3)
      }));
  const me = view.me?.rosterId ?? null;
  const held: string[] = [];
  for (let round = 1; round <= draft.rounds; round++) for (const r of rows) if (draft.owner(round, r.rosterId) === me) held.push(pickLabel(round, r.pick));
  const weight = Math.round(DRAFT_WIN_WEIGHT * 100);
  return (
    <View>
      <View className="flex-row border-b border-night-800 px-3 pb-2">
        <Text className="w-11 text-[11px] font-semibold text-night-500">Pick</Text>
        <Text className="flex-1 text-[11px] font-semibold text-night-500">Team</Text>
        <Text className="w-11 text-right text-[11px] font-semibold text-night-500">W</Text>
        <Text className="w-16 text-right text-[11px] font-semibold text-night-500">Max PF</Text>
        <Text className="w-14 text-right text-[11px] font-semibold text-night-500">{projection ? '#1' : 'Score'}</Text>
      </View>
      {rows.map((r) => {
        const holder = draft.owner(1, r.rosterId);
        const mine = holder === me;
        return (
          <View key={r.rosterId} className={`flex-row items-center px-3 py-2 ${mine ? 'bg-owl-cyan/10' : ''}`}>
            <Text className="w-11 text-[13px] text-night-300" style={tabular}>
              {pickLabel(1, r.pick)}
            </Text>
            <View className="flex-1">
              <Text numberOfLines={1} className={`text-[14px] ${mine ? 'font-bold text-night-100' : 'text-night-100'}`}>
                {view.nameOf(r.rosterId)}
              </Text>
              {holder !== r.rosterId ? (
                <Text numberOfLines={1} className="text-[11px] text-night-500">
                  → {view.nameOf(holder)}
                </Text>
              ) : null}
            </View>
            <Text className="w-11 text-right text-[13px] text-night-300" style={tabular}>
              {Math.round(r.wins * 10) / 10}
            </Text>
            <Text className="w-16 text-right text-[13px] text-night-300" style={tabular}>
              {r.max ? r.max.toFixed(1) : '–'}
            </Text>
            <Text className="w-14 text-right text-[13px] text-night-500" style={tabular}>
              {r.extra}
            </Text>
          </View>
        );
      })}
      <Text className="px-3 pt-2 text-[12px] leading-4 text-night-500">
        {weight}% wins + {100 - weight}% max points{projection ? ' on projected final numbers' : ''}, worst first.{' '}
        {held.length ? `You${projection ? "'d" : ''} hold ${held.join(', ')}.` : `You hold no ${draft.season} picks.`}
      </Text>
    </View>
  );
}
