// On-device player directory and play history.
//
// ~5,000 slim players live in an indexed table (lookups by id, ESPN id, name
// + team, position). The play feed's history persists so a relaunch mid-game
// shows what already happened.
import * as SQLite from 'expo-sqlite';
import type { EnrichedPlayEvent, SlimNflPlayer } from '@nightowl/core';

const DB_NAME = 'nightowl_v1.db';
export const UPSERT_CHUNK = 400;
const MAX_PLAY_HISTORY = 2000;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS nfl_players (
  player_id TEXT PRIMARY KEY NOT NULL,
  espn_id TEXT,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  position TEXT NOT NULL,
  team TEXT,
  injury_status TEXT,
  search_rank INTEGER,
  json_payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_espn_id ON nfl_players(espn_id);
CREATE INDEX IF NOT EXISTS idx_players_norm_name_team ON nfl_players(normalized_name, team);
CREATE INDEX IF NOT EXISTS idx_players_position ON nfl_players(position);

CREATE TABLE IF NOT EXISTS play_events_history (
  play_key TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  net_points REAL NOT NULL,
  json_payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plays_timestamp ON play_events_history(timestamp DESC);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** The shared connection, opened and migrated once. */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA);
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Insert or replace players in chunks of 400, each chunk one transaction. */
export async function upsertPlayersBatch(players: SlimNflPlayer[]): Promise<void> {
  const db = await getDatabase();
  for (let start = 0; start < players.length; start += UPSERT_CHUNK) {
    const chunk = players.slice(start, start + UPSERT_CHUNK);
    await db.withExclusiveTransactionAsync(async (txn) => {
      const stmt = await txn.prepareAsync(
        `INSERT OR REPLACE INTO nfl_players
           (player_id, espn_id, full_name, normalized_name, position, team, injury_status, search_rank, json_payload)
         VALUES ($id, $espn, $name, $norm, $pos, $team, $injury, $rank, $json)`
      );
      try {
        for (const p of chunk) {
          await stmt.executeAsync({
            $id: p.player_id,
            $espn: p.espn_id,
            $name: p.full_name,
            $norm: p.normalized_name,
            $pos: p.position,
            $team: p.team,
            $injury: p.injury_status,
            $rank: p.search_rank,
            $json: JSON.stringify(p)
          });
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
  }
}

/** Replace the whole directory (players who retired or were cut drop out). */
export async function replaceAllPlayers(players: SlimNflPlayer[]): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM nfl_players');
  await upsertPlayersBatch(players);
}

const parsePlayers = (rows: Array<{ json_payload: string }>): SlimNflPlayer[] =>
  rows.map((r) => JSON.parse(r.json_payload) as SlimNflPlayer);

/** Every player, for the in-memory hot map. */
export async function loadAllPlayers(): Promise<Record<string, SlimNflPlayer>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ json_payload: string }>('SELECT json_payload FROM nfl_players');
  const out: Record<string, SlimNflPlayer> = {};
  for (const p of parsePlayers(rows)) out[p.player_id] = p;
  return out;
}

export async function countPlayers(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM nfl_players');
  return row?.n ?? 0;
}

export async function findPlayerByEspnId(espnId: string): Promise<SlimNflPlayer | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ json_payload: string }>('SELECT json_payload FROM nfl_players WHERE espn_id = ?', espnId);
  return row ? (JSON.parse(row.json_payload) as SlimNflPlayer) : null;
}

export async function findPlayersByNameTeam(normalizedName: string, team: string | null): Promise<SlimNflPlayer[]> {
  const db = await getDatabase();
  const rows = team
    ? await db.getAllAsync<{ json_payload: string }>('SELECT json_payload FROM nfl_players WHERE normalized_name = ? AND team = ?', normalizedName, team)
    : await db.getAllAsync<{ json_payload: string }>('SELECT json_payload FROM nfl_players WHERE normalized_name = ?', normalizedName);
  return parsePlayers(rows);
}

/** Best available for the draft room: by Sleeper search rank, skipping drafted ids. */
export async function bestAvailable(excludeIds: ReadonlySet<string>, positions: readonly string[], limit: number): Promise<SlimNflPlayer[]> {
  const db = await getDatabase();
  const placeholders = positions.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{ json_payload: string; player_id: string }>(
    `SELECT player_id, json_payload FROM nfl_players
       WHERE search_rank IS NOT NULL AND position IN (${placeholders})
       ORDER BY search_rank ASC LIMIT ?`,
    ...positions,
    limit + excludeIds.size
  );
  return parsePlayers(rows.filter((r) => !excludeIds.has(r.player_id))).slice(0, limit);
}

export async function savePlayEvents(events: EnrichedPlayEvent[]): Promise<void> {
  if (!events.length) return;
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const stmt = await txn.prepareAsync(
      `INSERT OR REPLACE INTO play_events_history (play_key, game_id, timestamp, net_points, json_payload)
       VALUES ($key, $game, $ts, $net, $json)`
    );
    try {
      for (const e of events) {
        await stmt.executeAsync({
          $key: `${e.gameId}:${e.playId}`,
          $game: e.gameId,
          $ts: e.timestamp,
          $net: e.totalNetPointsForUser,
          $json: JSON.stringify(e)
        });
      }
    } finally {
      await stmt.finalizeAsync();
    }
    await txn.runAsync(
      `DELETE FROM play_events_history WHERE play_key NOT IN
         (SELECT play_key FROM play_events_history ORDER BY timestamp DESC LIMIT ?)`,
      MAX_PLAY_HISTORY
    );
  });
}

/** Newest first. `sinceMs` limits to the current slate. */
export async function loadPlayEvents(sinceMs: number, limit = 500): Promise<EnrichedPlayEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ json_payload: string }>(
    'SELECT json_payload FROM play_events_history WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?',
    sinceMs,
    limit
  );
  return rows.map((r) => JSON.parse(r.json_payload) as EnrichedPlayEvent);
}

export async function clearPlayEvents(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM play_events_history');
}
