// Tab 5: Season. Standings and next year's draft order, as they stand now or
// projected to the end of the season, plus a projected playoff bracket.
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Chip, ChipRow, EmptyState, ErrorBanner, Num, ScreenHeader, SectionLabel, Segmented, SkeletonRows } from '../../components/common/ui';
import { DraftOrderList } from '../../components/season/DraftOrderList';
import { PlayoffBracket } from '../../components/season/PlayoffBracket';
import { StandingsNow, StandingsProjected } from '../../components/season/StandingsTable';
import { odds, ordinal, projRecord, record } from '../../components/season/format';
import { settings } from '../../db/mmkvStorage';
import { useSeason, useSeasonLeagues } from '../../hooks/useSeason';
import type { DraftMethod, SeasonMode } from '../../hooks/useSeason';
import { useNightOwlStore } from '../../store/useNightOwlStore';
import { colors } from '../../theme';
import { launchArgument } from '../../utils/launchArguments';

function Kpi({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <View className="flex-1">
      <Num className="text-[18px] font-bold" style={{ color: tone ?? colors.night100 }}>
        {value}
      </Num>
      <Text className="text-[11px] text-night-500">{label}</Text>
    </View>
  );
}

export default function Season() {
  const leagues = useSeasonLeagues();
  const week = useNightOwlStore((s) => s.week);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [mode, setMode] = useState<SeasonMode>(() => {
    const arg = launchArgument('NightOwlSeasonMode');
    return arg === 'projected' || arg === 'now' ? arg : settings.getSeasonMode();
  });
  const [method, setMethod] = useState<DraftMethod>(settings.getDraftMethod());
  const selected = leagues.find((l) => l.league_id === leagueId) ?? leagues[0] ?? null;

  useEffect(() => {
    if (!leagueId && leagues[0]) setLeagueId(leagues[0].league_id);
  }, [leagueId, leagues]);

  const { view, projection, loading, projecting, error, refresh } = useSeason(selected?.league_id ?? null, mode, method);
  const projected = mode === 'projected' && !!projection;
  const me = view?.me ?? null;
  const mine = projected && me ? projection.teams[me.rosterId] : null;
  const place = projected && me ? projection.order.indexOf(me.rosterId) + 1 : (me?.rank ?? 0);

  return (
    <SafeAreaView className="flex-1 bg-night-950" edges={['top']}>
      <ScreenHeader title="Season" subtitle={week ? `Week ${week}${mode === 'projected' ? ' · projected to the end' : ''}` : null} />
      <View className="px-4 pb-2">
        <Segmented<SeasonMode>
          options={[
            { value: 'now', label: 'Now' },
            { value: 'projected', label: 'Projected' }
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            settings.setSeasonMode(m);
          }}
        />
      </View>
      <ChipRow>
        {leagues.map((l) => (
          <Chip key={l.league_id} label={l.name.trim()} active={selected?.league_id === l.league_id} onPress={() => setLeagueId(l.league_id)} />
        ))}
      </ChipRow>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl tintColor={colors.night300} refreshing={false} onRefresh={refresh} />}>
        {error && view ? <View className="pt-2"><ErrorBanner message="Couldn't refresh everything; showing what loaded." onRetry={refresh} /></View> : null}
        {!leagues.length ? (
          <EmptyState icon="list.number" title="No in-season leagues" body="Standings show up here once your leagues' seasons start." />
        ) : loading || !view ? (
          <View className="pt-3">
            <SkeletonRows count={3} height={110} />
          </View>
        ) : (
          <>
            {me ? (
              <Card className="mx-4 mt-3 p-3.5">
                <View className="mb-2.5 flex-row items-center justify-between">
                  <Text className="text-[15px] font-semibold text-night-100">{view.nameOf(me.rosterId)}</Text>
                  <Text className="text-[13px] font-semibold" style={{ color: view.playoffTeams && place <= view.playoffTeams ? colors.pos : colors.night300 }}>
                    {projected ? 'proj. ' : ''}
                    {ordinal(place)} of {view.rows.length}
                  </Text>
                </View>
                {mine ? (
                  <View className="flex-row">
                    <Kpi value={projRecord(mine.wins, mine.losses)} label="proj. record" />
                    {view.playoffTeams ? <Kpi value={odds(mine.playoffOdds)} label="playoffs" tone={mine.playoffOdds >= 0.5 ? colors.pos : colors.neg} /> : null}
                    {projection?.bracket ? <Kpi value={odds(mine.byeOdds)} label="bye" /> : null}
                    {projection?.bracket ? <Kpi value={odds(mine.titleOdds)} label="title" tone={colors.cyan} /> : null}
                  </View>
                ) : (
                  <View className="flex-row">
                    <Kpi value={record(me.wins, me.losses, me.ties)} label={view.medianGame ? 'incl. median' : 'record'} />
                    {me.playoffOdds !== null ? <Kpi value={odds(me.playoffOdds)} label="playoffs" tone={me.playoffOdds >= 0.5 ? colors.pos : colors.neg} /> : null}
                    <Kpi
                      value={me.luck === null ? '–' : `${me.luck > 0 ? '+' : me.luck < 0 ? '−' : ''}${Math.abs(me.luck)}`}
                      label="wins of luck"
                      tone={me.luck !== null && me.luck > 0 ? colors.pos : me.luck !== null && me.luck < 0 ? colors.neg : undefined}
                    />
                    <Kpi value={me.efficiency === null ? '–' : `${Math.round(me.efficiency * 100)}%`} label="of max pts" />
                  </View>
                )}
              </Card>
            ) : null}

            {mode === 'projected' && !view.regularSeasonLeft ? (
              <Text className="mx-4 mt-3 text-[13px] text-night-500">The regular season is over; showing standings as they are.</Text>
            ) : null}

            <SectionLabel>{projected ? 'Projected standings' : 'Standings'}</SectionLabel>
            <Card className="mx-4 py-2.5">
              {mode === 'projected' && view.regularSeasonLeft && !projection ? (
                <View className="py-6">
                  <Text className="text-center text-[13px] text-night-500">{projecting ? 'Projecting the rest of the season…' : 'Waiting for projections…'}</Text>
                </View>
              ) : projected ? (
                <StandingsProjected view={view} projection={projection} />
              ) : (
                <StandingsNow view={view} />
              )}
            </Card>

            {projected && projection.bracket ? (
              <>
                <SectionLabel>Projected playoffs</SectionLabel>
                <PlayoffBracket bracket={projection.bracket} me={me?.rosterId ?? null} nameOf={view.nameOf} titleOdds={(id) => projection.teams[id]?.titleOdds ?? 0} />
              </>
            ) : null}

            {view.draft ? (
              <>
                <SectionLabel>{`${view.draft.season} draft order${projected ? ' · projected' : ''}`}</SectionLabel>
                <View className="mx-4 mb-2">
                  <Segmented<DraftMethod>
                    options={[
                      { value: 'linear', label: 'Linear' },
                      { value: 'inverse', label: 'Inverse' }
                    ]}
                    value={method}
                    onChange={(m) => {
                      setMethod(m);
                      settings.setDraftMethod(m);
                    }}
                  />
                </View>
                <Card className="mx-4 py-2.5">
                  <DraftOrderList view={view} projection={projected ? projection : null} method={method} />
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
