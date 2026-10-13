import { describe, expect, it } from 'vitest';
import {
  calculatePlayFantasyPoints,
  scoringTags,
  statLineDelta,
  statLinePoints
} from '../engine/scoringEngine';
import { HALF, PPR, STANDARD, player } from './fixtures';

const wr = player('wr', 'Puka Nacua', 'WR', 'LAR');
const te = player('te', 'Trey McBride', 'TE', 'ARI');
const qb = player('qb', 'Josh Allen', 'QB', 'BUF');
const rb = player('rb', 'James Cook', 'RB', 'BUF');

describe('calculatePlayFantasyPoints', () => {
  const catch12 = { playerId: 'wr', rec: 1, recYds: 12 };

  it('scores a catch in Standard, Half and full PPR', () => {
    expect(calculatePlayFantasyPoints(catch12, wr, STANDARD)).toBe(1.2);
    expect(calculatePlayFantasyPoints(catch12, wr, HALF)).toBe(1.7);
    expect(calculatePlayFantasyPoints(catch12, wr, PPR)).toBe(2.2);
  });

  it('adds the TE premium only for tight ends', () => {
    const tep = { ...PPR, bonus_rec_te: 0.75 };
    expect(calculatePlayFantasyPoints({ ...catch12, playerId: 'te' }, te, tep)).toBe(2.95);
    expect(calculatePlayFantasyPoints(catch12, wr, tep)).toBe(2.2);
  });

  it('uses 6-point passing TDs when the league does', () => {
    const play = { playerId: 'qb', passAtt: 1, passCmp: 1, passYds: 25, passTd: 1 };
    expect(calculatePlayFantasyPoints(play, qb, PPR)).toBe(5);
    expect(calculatePlayFantasyPoints(play, qb, { ...PPR, pass_td: 6 })).toBe(7);
  });

  it('pays 40+ and 50+ yard TD bonuses on the play itself', () => {
    const scoring = { ...PPR, bonus_rec_td_40p: 2, bonus_rec_td_50p: 1, rec_40p: 0.5, bonus_pass_td_40p: 2, bonus_pass_td_50p: 1 };
    const rec55 = { playerId: 'wr', rec: 1, recYds: 55, recTd: 1 };
    // 1 rec + 5.5 yds + 6 TD + 0.5 (40+ catch) + 2 (40+ TD) + 1 (50+ TD)
    expect(calculatePlayFantasyPoints(rec55, wr, scoring)).toBe(16);
    const pass45 = { playerId: 'qb', passAtt: 1, passCmp: 1, passYds: 45, passTd: 1 };
    // 1.8 yds + 4 TD + 2 (40+ TD); not 50+
    expect(calculatePlayFantasyPoints(pass45, qb, scoring)).toBe(7.8);
  });

  it('credits a 100-yard bonus on the play that crosses it, and only that one', () => {
    const scoring = { ...PPR, bonus_rush_yd_100: 3 };
    const run = { playerId: 'rb', rushAtt: 1, rushYds: 8 };
    expect(calculatePlayFantasyPoints(run, rb, scoring, { passYds: 0, rushYds: 95, recYds: 0 }, { passYds: 0, rushYds: 103, recYds: 0 })).toBe(3.8);
    expect(calculatePlayFantasyPoints(run, rb, scoring, { passYds: 0, rushYds: 103, recYds: 0 }, { passYds: 0, rushYds: 111, recYds: 0 })).toBe(0.8);
  });

  it('credits the 300-yard passing bonus and takes it back on a correction', () => {
    const scoring = { ...PPR, bonus_pass_yd_300: 3 };
    const comp = { playerId: 'qb', passAtt: 1, passCmp: 1, passYds: 10 };
    expect(calculatePlayFantasyPoints(comp, qb, scoring, { passYds: 295, rushYds: 0, recYds: 0 }, { passYds: 305, rushYds: 0, recYds: 0 })).toBe(3.4);
    const correction = { playerId: 'qb', passYds: -10 };
    expect(calculatePlayFantasyPoints(correction, qb, scoring, { passYds: 305, rushYds: 0, recYds: 0 }, { passYds: 295, rushYds: 0, recYds: 0 })).toBe(-3.4);
  });

  it('scores tiered PPR by the yardage of a single catch', () => {
    const tiered = { rec: 0, rec_yd: 0.1, rec_0_4: 0.5, rec_5_9: 0.75, rec_10_19: 1, rec_20_29: 1.25, rec_30_39: 1.5, rec_40p_tiered: 2 };
    expect(calculatePlayFantasyPoints({ playerId: 'wr', rec: 1, recYds: 3 }, wr, tiered)).toBe(0.8);
    expect(calculatePlayFantasyPoints({ playerId: 'wr', rec: 1, recYds: 22 }, wr, tiered)).toBe(3.45);
    expect(calculatePlayFantasyPoints({ playerId: 'wr', rec: 1, recYds: 41 }, wr, tiered)).toBe(6.1);
  });

  it('applies first downs, fumbles lost and IDP defaults', () => {
    expect(calculatePlayFantasyPoints({ playerId: 'rb', rushAtt: 1, rushYds: 4, rushFirstDown: 1, fum: 1, fumLost: 1 }, rb, { ...PPR, rush_fd: 0.5, fum: -0.5 })).toBe(-1.6);
    const lb = player('lb', 'Fred Warner', 'LB', 'SF');
    expect(calculatePlayFantasyPoints({ playerId: 'lb', idpTklSolo: 1, idpTklAst: 1, idpSack: 1 }, lb, { idp_tkl: 1, idp_sack: 4 })).toBe(5.5);
  });

  it('defaults to standard weights when a league leaves keys out', () => {
    expect(calculatePlayFantasyPoints({ playerId: 'qb', passYds: 250, passTd: 2, passInt: 1 }, qb, {})).toBe(17);
  });
});

describe('Sleeper stat lines', () => {
  it('sums stat × weight, matching Sleeper, including derived bonus keys', () => {
    expect(statLinePoints({ rec: 6, rec_yd: 87, rec_td: 1, bonus_rec_yd_100: 0, pts_ppr: 20.7 }, PPR)).toBe(20.7);
    expect(statLinePoints({ rec: 8, rec_yd: 104, bonus_rec_yd_100: 1 }, { ...PPR, bonus_rec_yd_100: 3 })).toBe(21.4);
  });

  it('diffs two stat lines', () => {
    expect(statLineDelta({ rec: 2, rec_yd: 20 }, { rec: 3, rec_yd: 35, rec_td: 1 })).toEqual({ rec: 1, rec_yd: 15, rec_td: 1 });
    expect(statLineDelta({ rec: 2 }, { rec: 2 })).toEqual({});
  });
});

describe('scoringTags', () => {
  it('labels scoring and roster formats', () => {
    expect(scoringTags({ rec: 1, bonus_rec_te: 0.5 }, ['QB', 'SUPER_FLEX', 'BN'], false)).toEqual(['PPR', 'TEP', 'Superflex']);
    expect(scoringTags({ rec: 0.5 }, ['QB', 'DL'], true)).toEqual(['Half-PPR', 'IDP', 'Best Ball']);
    expect(scoringTags({}, ['QB'], false)).toEqual(['Standard']);
  });
});
