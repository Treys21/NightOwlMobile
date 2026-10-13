// Night Owl BFF: a small Cloudflare Worker in front of the public feeds.
//
//   GET /api/v1/players/slim             slim player directory, ETag / 304
//   GET /api/v1/odds?season&week&seasonType   normalized Vegas slate (15 min cache)
//   GET /health
//
// Crons rebuild the player directory daily and prewarm odds every 15 minutes.
import { HttpClient, LiveFeedClient, SleeperClient, activeWeek, statSeasonType } from '@nightowl/core';
import type { SeasonType } from '@nightowl/core';
import type { Env } from './env';
import { getSlimPlayers, refreshSlimPlayers } from './slimPlayers';
import { ODDS_TTL_SECONDS, buildSlate, getSlate, oddsKey } from './oddsNormalizer';

const SEASON_TYPES: ReadonlySet<string> = new Set(['pre', 'regular', 'post']);
const PREWARM_WINDOW_MS = 36 * 3600000;

export function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  const allow = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : (allowed[0] ?? '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'If-None-Match, Content-Type',
    'Access-Control-Expose-Headers': 'ETag',
    Vary: 'Origin'
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

/** Does an If-None-Match header list this ETag (weak or strong)? */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  const bare = etag.replace(/^W\//, '');
  return header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === bare);
}

async function handlePlayers(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const record = await getSlimPlayers(env);
  const headers = { ...cors, ETag: record.etag, 'Cache-Control': 'public, max-age=3600' };
  if (etagMatches(request.headers.get('If-None-Match'), record.etag)) return new Response(null, { status: 304, headers });
  return new Response(record.body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

async function handleOdds(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const season = url.searchParams.get('season') ?? '';
  const week = Number(url.searchParams.get('week'));
  const seasonType = url.searchParams.get('seasonType') ?? 'regular';
  if (!/^\d{4}$/.test(season) || !Number.isInteger(week) || week < 1 || week > 25 || !SEASON_TYPES.has(seasonType)) {
    return json({ error: 'season (YYYY), week (1-25) and seasonType (pre|regular|post) are required' }, 400, cors);
  }
  const slate = await getSlate(env, season, week, seasonType as SeasonType);
  return json(slate, 200, { ...cors, 'Cache-Control': `public, max-age=${Math.floor(ODDS_TTL_SECONDS / 3)}` });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(env, request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Max-Age': '86400' } });
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);
  const url = new URL(request.url);
  try {
    switch (url.pathname) {
      case '/health':
        return json({ ok: true, oddsApi: Boolean(env.ODDS_API_KEY) }, 200, cors);
      case '/api/v1/players/slim':
        return await handlePlayers(request, env, cors);
      case '/api/v1/odds':
        return await handleOdds(url, env, cors);
      default:
        return json({ error: 'not found' }, 404, cors);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'upstream error' }, 502, cors);
  }
}

/** Cron work: the daily player rebuild, or the 15-minute odds prewarm. */
export async function handleScheduled(cron: string, env: Env): Promise<void> {
  if (cron === '0 8 * * *') {
    await refreshSlimPlayers(env);
    return;
  }
  const http = new HttpClient();
  const state = await new SleeperClient(http).getNflState();
  if (state.season_type === 'off') return;
  const season = state.season;
  const week = activeWeek(state);
  const seasonType = statSeasonType(state);
  const { games } = await new LiveFeedClient(http).getWeek(season, week, seasonType);
  const now = Date.now();
  if (!games.some((g) => g.state === 'pre' && g.kickoff - now < PREWARM_WINDOW_MS)) return;
  const slate = await buildSlate(env, season, week, seasonType);
  await env.NIGHTOWL_KV.put(oddsKey(season, seasonType, week), JSON.stringify(slate), { expirationTtl: ODDS_TTL_SECONDS });
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env),
  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext): void => {
    ctx.waitUntil(handleScheduled(controller.cron, env));
  }
} satisfies ExportedHandler<Env>;
