/** Bindings and secrets the Worker runs with (see wrangler.toml). */
export interface Env {
  NIGHTOWL_KV: KVNamespace;
  /** The Odds API key, set with `wrangler secret put ODDS_API_KEY`. Optional: without it /odds serves ESPN lines. */
  ODDS_API_KEY?: string;
  /** Comma-separated origins allowed by CORS; '*' when unset. */
  ALLOWED_ORIGINS?: string;
}
