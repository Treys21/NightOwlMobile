import { describe, expect, it } from 'vitest';
import { buildPlayerLookup, normalizePlayerName } from '../engine/playerNormalizer';
import { cleanPlayText, downAndDistance, gameTeams, parsePlay, parsePlayStats, parseSummary } from '../engine/playParser';
import type { EspnPlay, EspnSummary } from '../types/espn';
import { player } from './fixtures';

// Real play text from Bills at Rams, 2026 week 5 (ESPN event 401872994).
const lookup = buildPlayerLookup([
  player('allen', 'Josh Allen', 'QB', 'BUF'),
  player('cook', 'James Cook', 'RB', 'BUF'),
  player('knox', 'Dawson Knox', 'TE', 'BUF'),
  player('coleman', 'Keon Coleman', 'WR', 'BUF'),
  player('stafford', 'Matthew Stafford', 'QB', 'LAR'),
  player('adams', 'Davante Adams', 'WR', 'LAR'),
  player('parkinson', 'Colby Parkinson', 'TE', 'LAR'),
  player('landman', 'Nate Landman', 'LB', 'LAR'),
  player('stewart', 'Jared Stewart', 'DL', 'LAR'),
  player('watson', 'Jaylen Watson', 'DB', 'LAR'),
  player('benford', 'Christian Benford', 'DB', 'BUF'),
  player('torrence', "O'Cyrus Torrence", 'DL', 'BUF'),
  player('donald', 'Aaron Donald', 'DL', 'LAR'),
  player('asb', 'Amon-Ra St. Brown', 'WR', 'DET'),
  player('jsn', 'Jaxon Smith-Njigba', 'WR', 'SEA')
]);

const summary: EspnSummary = {
  header: {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', team: { id: '14', abbreviation: 'LAR' } },
          { homeAway: 'away', team: { id: '2', abbreviation: 'BUF' } }
        ]
      }
    ]
  }
};
const teams = gameTeams(summary, '401872994');
const BUF = { id: '2' };
const LAR = { id: '14' };

const play = (id: string, text: string, team: { id: string }, extra: Partial<EspnPlay> = {}): EspnPlay => ({
  id,
  sequenceNumber: id,
  type: { text: 'Rush' },
  text,
  start: { down: 1, distance: 10, yardsToEndzone: 60, team },
  ...extra
});

const stats = (p: EspnPlay) => Object.fromEntries(parsePlayStats(p, teams, lookup).map((d) => [d.playerId, d]));

describe('parsePlayStats', () => {
  it('parses a run with a solo tackle', () => {
    const s = stats(play('1', 'J.Cook up the middle to LA 23 for 3 yards (N.Landman).', BUF));
    expect(s.cook).toMatchObject({ rushAtt: 1, rushYds: 3 });
    expect(s.cook?.rushFirstDown).toBeUndefined();
    expect(s.landman).toMatchObject({ idpTklSolo: 1 });
  });

  it('parses a completion, first down and tackle', () => {
    const s = stats(play('2', '(Shotgun) M.Stafford pass short left to C.Parkinson pushed ob at LA 33 for 3 yards (C.Benford).', LAR, { type: { text: 'Pass Reception' }, start: { down: 3, distance: 2, yardsToEndzone: 70, team: LAR } }));
    expect(s.stafford).toMatchObject({ passAtt: 1, passCmp: 1, passYds: 3, passFirstDown: 1 });
    expect(s.parkinson).toMatchObject({ rec: 1, recYds: 3, recFirstDown: 1 });
    expect(s.benford).toMatchObject({ idpTklSolo: 1 });
  });

  it('parses a passing touchdown', () => {
    const s = stats(play('3', '(Shotgun) M.Stafford pass short left to D.Adams for 4 yards, TOUCHDOWN. H.Mevis extra point is GOOD, Center-J.Cardona, Holder-E.Evans.', LAR, { type: { text: 'Passing Touchdown' }, scoringPlay: true }));
    expect(s.stafford).toMatchObject({ passCmp: 1, passYds: 4, passTd: 1 });
    expect(s.adams).toMatchObject({ rec: 1, recYds: 4, recTd: 1 });
  });

  it('parses a rushing touchdown', () => {
    const s = stats(play('4', 'J.Cook right tackle for 17 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson, Holder-T.Doman.', BUF, { start: { down: 2, distance: 6, yardsToEndzone: 17, team: BUF } }));
    expect(s.cook).toMatchObject({ rushAtt: 1, rushYds: 17, rushTd: 1, rushFirstDown: 1 });
  });

  it('parses a sack with credit to the defender', () => {
    const s = stats(play('5', '(Shotgun) J.Allen sacked at LA 31 for -8 yards (J.Stewart).', BUF, { type: { text: 'Sack' } }));
    expect(s.allen).toMatchObject({ passSack: 1 });
    expect(s.stewart).toMatchObject({ idpSack: 1 });
  });

  it('parses an incompletion', () => {
    const s = stats(play('6', '(Shotgun) J.Allen pass incomplete deep middle to D.Knox.', BUF, { type: { text: 'Pass Incompletion' } }));
    expect(s.allen).toMatchObject({ passAtt: 1, passInc: 1 });
    expect(s.knox).toBeUndefined();
  });

  it('parses an interception', () => {
    const s = stats(play('7', '(Shotgun) J.Allen pass deep right intended for K.Coleman INTERCEPTED by J.Watson at LA 40. J.Watson to LA 43 for 3 yards (D.Knox).', BUF, { type: { text: 'Pass Interception Return' } }));
    expect(s.allen).toMatchObject({ passAtt: 1, passInt: 1 });
    expect(s.watson).toMatchObject({ idpInt: 1 });
    expect(s.coleman).toBeUndefined();
  });

  it('parses a lost fumble with forced-fumble and recovery credit', () => {
    const s = stats(play('8', 'J.Cook up the middle to LA 22 for no gain (N.Landman). FUMBLES (N.Landman), RECOVERED by LA-A.Donald at LA 20.', BUF));
    expect(s.cook).toMatchObject({ rushAtt: 1, fum: 1, fumLost: 1 });
    expect(s.cook?.rushYds).toBeUndefined();
    expect(s.landman).toMatchObject({ idpTklSolo: 1, idpFf: 1 });
    expect(s.donald).toMatchObject({ idpFr: 1 });
  });

  it('keeps an own-recovered fumble from counting as lost', () => {
    const s = stats(play('9', 'J.Cook up the middle to 50 for no gain (N.Landman). FUMBLES (N.Landman), recovered by BUF-O.Torrence at 50.', BUF));
    expect(s.cook).toMatchObject({ fum: 1 });
    expect(s.cook?.fumLost).toBeUndefined();
    expect(s.torrence).toBeUndefined();
  });

  it('ignores penalties that wipe out the play, and non-plays', () => {
    expect(parsePlayStats(play('10', 'J.Cook left end for 12 yards (N.Landman). PENALTY on BUF-D.Knox, Offensive Holding, 10 yards, enforced at BUF 30 - No Play.', BUF), teams, lookup)).toEqual([]);
    expect(parsePlayStats(play('11', 'Timeout #1 by LA at 11:02.', BUF, { type: { text: 'Timeout' } }), teams, lookup)).toEqual([]);
    expect(parsePlayStats(play('12', 'T.Bass 49 yard field goal is GOOD, Center-R.Ferguson, Holder-T.Doman.', BUF, { type: { text: 'Field Goal Good' } }), teams, lookup)).toEqual([]);
  });

  it('parses a successful two-point pass', () => {
    const s = stats(play('13', 'J.Cook left end for 1 yard, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Allen pass to D.Knox is complete. ATTEMPT SUCCEEDS.', BUF, { start: { down: 1, distance: 1, yardsToEndzone: 1, team: BUF } }));
    expect(s.cook).toMatchObject({ rushTd: 1 });
    expect(s.allen).toMatchObject({ pass2Pt: 1 });
    expect(s.knox).toMatchObject({ rec2Pt: 1 });
  });

  it('skips "reported in as eligible" and direct-snap preambles', () => {
    const s = stats(play('16', '(Shotgun) C.Vinson reported in as eligible. Direct snap to J.Cook.  J.Cook up the middle to LA 3 for -2 yards (N.Landman).', BUF));
    expect(s.cook).toMatchObject({ rushAtt: 1, rushYds: -2 });
    expect(s.landman).toMatchObject({ idpTklSolo: 1, idpTklLoss: 1 });
  });

  it('gives a fumble-return touchdown to the defense, not the offense', () => {
    const s = stats(play('17', '(Shotgun) J.Allen pass short middle to D.Knox to BUF 34 for 9 yards (N.Landman). FUMBLES (N.Landman), RECOVERED by LA-A.Donald at BUF 36. A.Donald for 36 yards, TOUCHDOWN.', BUF, { type: { text: 'Fumble Return Touchdown' } }));
    expect(s.allen?.passTd).toBeUndefined();
    expect(s.knox).toMatchObject({ rec: 1, recYds: 9, fum: 1, fumLost: 1 });
    expect(s.knox?.recTd).toBeUndefined();
    expect(s.donald).toMatchObject({ idpFr: 1, idpTd: 1 });
  });

  it('credits yards only to the spot of an offensive foul downfield', () => {
    const s = stats(play('18', 'J.Cook up the middle to LA 21 for 9 yards (N.Landman).PENALTY on BUF-D.Knox, Offensive Holding, 10 yards, enforced at LA 25.', BUF, { start: { down: 1, distance: 10, yardsToEndzone: 30, team: BUF } }));
    expect(s.cook).toMatchObject({ rushAtt: 1, rushYds: 5 });
  });

  it('reads the result after a replay reversal', () => {
    expect(cleanPlayText('(Shotgun) J.Allen pass short right to D.Knox for 9 yards. The Replay Official reviewed the pass completion ruling, and the play was REVERSED. (Shotgun) J.Allen pass incomplete short right to D.Knox.')).toBe(
      'J.Allen pass incomplete short right to D.Knox.'
    );
  });
});

describe('name resolution', () => {
  it('resolves abbreviations with particles and hyphens on the right team', () => {
    expect(lookup.byAbbreviation('A.St. Brown', 'DET')?.player_id).toBe('asb');
    expect(lookup.byAbbreviation('J.Smith-Njigba', 'SEA')?.player_id).toBe('jsn');
    expect(lookup.byAbbreviation('J.Allen', 'LAR')).toBeNull();
  });

  it('prefers an ESPN participant id when the feed has one', () => {
    const espnLookup = buildPlayerLookup([player('allen', 'Josh Allen', 'QB', 'BUF', { espn_id: '3918298' }), player('other', 'Jordan Allen', 'QB', 'BUF')]);
    const s = parsePlayStats(
      play('14', 'J.Allen left end for 5 yards.', BUF, { participants: [{ athlete: { id: '3918298', displayName: 'Josh Allen' }, type: 'rusher' }] }),
      teams,
      espnLookup
    );
    expect(s[0]?.playerId).toBe('allen');
  });

  it('normalizes names consistently', () => {
    expect(normalizePlayerName("Ja'Marr Chase")).toBe('jamarr chase');
    expect(normalizePlayerName('Marvin Harrison Jr.')).toBe('marvin harrison');
    expect(normalizePlayerName('Hollywood Brown')).toBe('marquise brown');
  });
});

describe('play context', () => {
  it('builds down and distance, red zone and scores', () => {
    const p = play('15', 'J.Cook up the middle to LA 9 for 9 yards.', BUF, { start: { down: 3, distance: 4, yardsToEndzone: 18, team: BUF }, period: { number: 2 }, clock: { displayValue: '4:12' }, awayScore: 10, homeScore: 7 });
    expect(downAndDistance(p, 'BUF', 'LAR')).toBe('3rd & 4 at LAR 18');
    const parsed = parsePlay(p, teams, lookup, 1000);
    expect(parsed).toMatchObject({ isRedZonePlay: true, quarter: 2, clock: '4:12', awayTeam: 'BUF', homeTeam: 'LAR', awayScore: 10, homeScore: 7, timestamp: 1000 });
    expect(downAndDistance({ ...p, start: { down: 1, distance: 5, yardsToEndzone: 5, team: BUF } }, 'BUF', 'LAR')).toBe('1st & Goal at LAR 5');
  });

  it('reads every drive in order without duplicates', () => {
    const plays = parseSummary(
      {
        ...summary,
        drives: {
          previous: [{ plays: [play('2', 'J.Cook left end for 2 yards.', BUF), play('1', 'J.Cook left end for 1 yard.', BUF)] }],
          current: { plays: [play('2', 'J.Cook left end for 2 yards.', BUF), play('3', 'J.Cook left end for 3 yards.', BUF)] }
        }
      },
      'g',
      lookup,
      0
    );
    expect(plays.map((p) => p.playId)).toEqual(['1', '2', '3']);
  });
});
