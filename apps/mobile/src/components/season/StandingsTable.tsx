// League standings: now (as things stand) or projected (end of season).
import { Text, View } from 'react-native';
import type { SeasonProjection } from '@nightowl/core';
import { colors, tabular } from '../../theme';
import type { SeasonLeague } from '../../hooks/useSeason';
import { odds, projRecord, record } from './format';

/** The first column holds records ("13.6–14.4"), so it's wider. */
const colWidth = (i: number): string => (i === 0 ? 'w-[84px]' : 'w-[58px]');

function Header({ cells }: { cells: string[] }) {
  return (
    <View className="flex-row border-b border-night-800 px-3 pb-2">
      <Text className="w-6 text-[11px] font-semibold text-night-500">#</Text>
      <Text className="flex-1 text-[11px] font-semibold text-night-500">Team</Text>
      {cells.map((c, i) => (
        <Text key={c} className={`${colWidth(i)} text-right text-[11px] font-semibold text-night-500`}>
          {c}
        </Text>
      ))}
    </View>
  );
}

function Row({ rank, name, values, me, cut }: { rank: number; name: string; values: string[]; me: boolean; cut: boolean }) {
  return (
    <View className={`flex-row items-center px-3 py-2 ${me ? 'bg-owl-cyan/10' : ''}`} style={cut ? { borderBottomWidth: 1.5, borderBottomColor: colors.cyan } : undefined}>
      <Text className="w-6 text-[13px] text-night-500" style={tabular}>
        {rank}
      </Text>
      <Text numberOfLines={1} className={`flex-1 text-[14px] ${me ? 'font-bold text-night-100' : 'text-night-100'}`}>
        {name}
      </Text>
      {values.map((v, i) => (
        <Text key={i} numberOfLines={1} className={`${colWidth(i)} text-right text-[13px] text-night-300`} style={tabular}>
          {v}
        </Text>
      ))}
    </View>
  );
}

export function StandingsNow({ view }: { view: SeasonLeague }) {
  const hasOdds = view.rows.some((r) => r.playoffOdds !== null);
  return (
    <View>
      <Header cells={['Record', 'PF', hasOdds ? 'Playoffs' : 'Power']} />
      {view.rows.map((r) => (
        <Row
          key={r.rosterId}
          rank={r.rank}
          name={r.name}
          me={r.rosterId === view.me?.rosterId}
          cut={view.playoffTeams > 0 && r.rank === view.playoffTeams}
          values={[record(r.wins, r.losses, r.ties), Math.round(r.pf).toString(), hasOdds ? odds(r.playoffOdds ?? 0) : r.power === null ? '–' : Math.round(r.power).toString()]}
        />
      ))}
      <Text className="px-3 pt-2 text-[12px] leading-4 text-night-500">
        {view.playoffTeams ? `Line under ${view.playoffTeams}: playoff cut. ` : ''}
        {view.liveScored ? `Week ${view.next} counts as if it ended now.` : ''}
      </Text>
    </View>
  );
}

export function StandingsProjected({ view, projection }: { view: SeasonLeague; projection: SeasonProjection }) {
  const showTitle = !!projection.bracket;
  return (
    <View>
      <Header cells={['Record', view.playoffTeams ? 'Playoffs' : 'PF', showTitle ? 'Title' : 'Max']} />
      {projection.order.map((id, i) => {
        const t = projection.teams[id];
        if (!t) return null;
        return (
          <Row
            key={id}
            rank={i + 1}
            name={view.nameOf(id)}
            me={id === view.me?.rosterId}
            cut={view.playoffTeams > 0 && i + 1 === view.playoffTeams}
            values={[projRecord(t.wins, t.losses), view.playoffTeams ? odds(t.playoffOdds) : Math.round(t.pf).toString(), showTitle ? odds(t.titleOdds) : Math.round(t.max).toString()]}
          />
        );
      })}
      <Text className="px-3 pt-2 text-[12px] leading-4 text-night-500">
        {view.liveScored ? `Week ${view.next} so far, then e` : 'E'}ach team's best projected lineup every week through the playoffs, played out 2,000 times on the real schedule
        {view.medianGame ? ', median games included' : ''}. Records are averages.
      </Text>
    </View>
  );
}
