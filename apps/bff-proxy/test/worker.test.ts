import { describe, expect, it } from 'vitest';
import { buildPlayerLookup, slimPlayerDirectory } from '@nightowl/core';
import type { NflGame, SleeperRawPlayer } from '@nightowl/core';
import { etagMatches, handleRequest } from '../src/index';
import { PLAYERS_KEY, refreshSlimPlayers } from '../src/slimPlayers';
import { environmentFromOddsApi, matchGame, propsFromOddsApi } from '../src/oddsNormalizer';
import type { OddsApiEvent } from '../src/oddsNormalizer';
import type { Env } from '../src/env';

class MemoryKV {
  readonly store = new Map<string, string>();
  async get(key: string, type?: 'json' | 'text'): Promise<unknown> {
    const v = this.store.get(key);
    if (v === undefined) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

const RAW: Record<string, SleeperRawPlayer> = {
  '4984': { player_id: '4984', full_name: 'Josh Allen', first_name: 'Josh', last_name: 'Allen', position: 'QB', fantasy_positions: ['QB'], team: 'BUF', active: true, espn_id: 3918298, search_rank: 3 },
  '9493': { player_id: '9493', full_name: 'Puka Nacua', first_name: 'Puka', last_name: 'Nacua', position: 'WR', fantasy_positions: ['WR'], team: 'LAR', active: true, search_rank: 5 },
  '1': { player_id: '1', full_name: 'Retired Guy', position: 'QB', active: false },
  '2': { player_id: '2', full_name: 'Some Punter', position: 'P', active: true },
  BUF: { player_id: 'BUF', first_name: 'Buffalo', last_name: 'Bills', position: 'DEF', team: 'BUF', active: true }
};

const env = (): Env => ({ NIGHTOWL_KV: new MemoryKV() as unknown as KVNamespace });
const sleeperFetch: typeof fetch = async () => new Response(JSON.stringify(RAW), { status: 200 });

describe('slim players', () => {
  it('keeps active fantasy players and stores an ETag', async () => {
    const e = env();
    const record = await refreshSlimPlayers(e, sleeperFetch);
    expect(record.count).toBe(3);
    expect(record.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect((e.NIGHTOWL_KV as unknown as MemoryKV).store.has(PLAYERS_KEY)).toBe(true);
    const players = JSON.parse(record.body);
    expect(players.map((p: { player_id: string }) => p.player_id)).toEqual(['4984', '9493', 'BUF']);
    expect(players[2].full_name).toBe('Buffalo Bills');
  });

  it('answers 304 when the client already has this version', async () => {
    const e = env();
    const record = await refreshSlimPlayers(e, sleeperFetch);
    const fresh = await handleRequest(new Request('https://bff.test/api/v1/players/slim'), e);
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get('ETag')).toBe(record.etag);
    const again = await handleRequest(new Request('https://bff.test/api/v1/players/slim', { headers: { 'If-None-Match': record.etag } }), e);
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(etagMatches(`W/${record.etag}, "other"`, record.etag)).toBe(true);
  });
});

describe('routing', () => {
  it('handles CORS preflight, validation and unknown routes', async () => {
    const e = { ...env(), ALLOWED_ORIGINS: 'https://a.test' };
    const pre = await handleRequest(new Request('https://bff.test/api/v1/odds', { method: 'OPTIONS', headers: { Origin: 'https://a.test' } }), e);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('https://a.test');
    expect((await handleRequest(new Request('https://bff.test/api/v1/odds?season=26&week=5'), e)).status).toBe(400);
    expect((await handleRequest(new Request('https://bff.test/nope'), e)).status).toBe(404);
    expect((await handleRequest(new Request('https://bff.test/health'), e)).status).toBe(200);
  });
});

describe('The Odds API normalization', () => {
  const game: NflGame = {
    id: '401872994', kickoff: Date.now() + 86400000, away: 'BUF', home: 'LAR', awayScore: 0, homeScore: 0,
    state: 'pre', started: false, remaining: 1, quarter: 0, clock: '', isDome: true, odds: null, isRedZone: false
  };
  const lookup = buildPlayerLookup(slimPlayerDirectory(RAW));
  const event: OddsApiEvent = {
    id: 'ev1',
    commence_time: '2026-10-19T00:15:00Z',
    home_team: 'Los Angeles Rams',
    away_team: 'Buffalo Bills',
    bookmakers: [
      {
        key: 'draftkings',
        last_update: '2026-10-18T12:00:00Z',
        markets: [
          { key: 'spreads', outcomes: [{ name: 'Los Angeles Rams', price: -110, point: -2.5 }, { name: 'Buffalo Bills', price: -110, point: 2.5 }] },
          { key: 'totals', outcomes: [{ name: 'Over', price: -110, point: 49.5 }, { name: 'Under', price: -110, point: 49.5 }] },
          { key: 'player_pass_tds', outcomes: [{ name: 'Over', description: 'Josh Allen', price: 120, point: 1.5 }, { name: 'Under', description: 'Josh Allen', price: -150, point: 1.5 }] },
          { key: 'player_pass_yds', outcomes: [{ name: 'Over', description: 'Josh Allen', price: -115, point: 245.5 }] },
          { key: 'player_receptions', outcomes: [{ name: 'Over', description: 'Puka Nacua', price: -130, point: 7.5 }, { name: 'Under', description: 'Puka Nacua', price: 100, point: 7.5 }] },
          { key: 'player_anytime_td', outcomes: [{ name: 'Yes', description: 'Puka Nacua', price: 130 }, { name: 'Yes', description: 'Nobody Known', price: 500 }] }
        ]
      }
    ]
  };

  it('matches the event to the ESPN game and splits the total by the spread', () => {
    expect(matchGame(event, [game])?.id).toBe('401872994');
    expect(environmentFromOddsApi(event, game)).toMatchObject({ homeSpread: -2.5, overUnderTotal: 49.5, homeImpliedTotal: 26, awayImpliedTotal: 23.5, isDome: true });
  });

  it('maps sportsbook names to Sleeper ids and fills each market', () => {
    const props = propsFromOddsApi(event, game, lookup);
    const allen = props.find((p) => p.playerId === '4984');
    const puka = props.find((p) => p.playerId === '9493');
    expect(allen).toMatchObject({ teamAbbr: 'BUF', opponentAbbr: 'LAR', passTdLine: 1.5, passTdOverOdds: 120, passTdUnderOdds: -150, passYdsLine: 245.5 });
    expect(puka).toMatchObject({ recLine: 7.5, recOverOdds: -130, recUnderOdds: 100, anytimeTdAmericanOdds: 130 });
    expect(puka?.anytimeTdFairProbability).toBeCloseTo((100 / 230) * 0.94, 4);
    expect(props).toHaveLength(2);
  });
});
