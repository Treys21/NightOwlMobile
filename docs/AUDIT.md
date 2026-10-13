# Phase 0 audit: Night Owl Chrome extension 3.6.0

Source: `Treys21/NightOwl` at commit `343a671` (Manifest V3, ~5,400 lines of JS
across 25 files). This catalogs every endpoint, parser and feature so the iOS
port keeps them, and records where the extension differs from the port spec.

## Network endpoints

| Endpoint | Extension use | iOS home |
| --- | --- | --- |
| `GET api.sleeper.app/v1/state/nfl` | season, `week`, `display_week`, `season_type` | `sleeperClient.getNflState` |
| `GET /v1/user/{username}` | username → user_id | `sleeperClient.getUser` |
| `GET /v1/user/{id}/leagues/nfl/{season}` | league discovery | `sleeperClient.getUserLeagues` |
| `GET /v1/league/{id}/rosters` | rosters, records, `ppts` (max points) | `sleeperClient.getRosters` |
| `GET /v1/league/{id}/users` | team names | `sleeperClient.getLeagueUsers` |
| `GET /v1/league/{id}/matchups/{week}` | starters, live totals | `sleeperClient.getMatchups` |
| `GET /v1/league/{id}/traded_picks` | next year's pick owners | `sleeperClient.getTradedPicks` |
| `GET /v1/league/{id}/drafts`, `/v1/draft/{id}`, `/v1/draft/{id}/picks` | draft board, on-the-clock | `sleeperClient.getLeagueDrafts/getDraft/getDraftPicks` |
| `GET /v1/players/nfl` (~5 MB, once a day) | player directory | `sleeperClient.getSlimPlayers`, trimmed on device and stored in SQLite |
| `GET api.sleeper.com/stats/nfl/{season}/{week}` | live stat lines; scoring = Σ stat × weight | `sleeperClient.getWeekStats` + `statTracker` |
| `GET api.sleeper.com/projections/nfl/{season}/{week}` | start/sit projections | `sleeperClient.getWeekProjections` |
| `GET api.sleeper.com/stats/nfl/{season}?position[]=DEF` | defense-vs-position ranks | `sleeperClient.getDefenseSeason` |
| `GET api.sleeper.com/schedule/nfl/{type}/{season}` | kickoff fallback when ESPN is down | `sleeperClient.getSchedule` |
| `GET api.sleeper.app/lines/available?sport=nfl` | Sleeper Picks over/unders, payouts, recent results | `sleeperClient.getPicksLines` |
| `GET site.api.espn.com/.../nfl/scoreboard` | kickoffs, game clock, spread/total | `liveFeedClient.getScoreboard` |
| `GET site.api.espn.com/.../nfl/injuries` | lineup alerts | `liveFeedClient.getInjuries` |
| `GET sports.core.api.espn.com/.../odds/100/propBets` (≤4 pages) | DraftKings milestone ladders | `oddsClient` direct fallback |
| `GET theringer.com/fantasy-football/2026-preseason` | draft rankings (RSC payload scrape) | not ported: a web-page scrape in an App Store app is brittle and a terms risk; the draft tab ranks by Sleeper `search_rank` instead |

No endpoint needs auth. ESPN blocks requests carrying a `sleeper.com`
Origin, which is why the extension relays through its service worker; a
native app sends no Origin, so iOS calls ESPN directly.

## Parsers and math (all pure, all ported)

- **Scoring** (`live/scoring.js`): Sleeper stat rows already include derived
  keys (`bonus_rec_yd_100`, `pts_allow_14_20`, `fgm_40_49` …), so a league's
  points are `Σ stats[key] × scoring[key]`, which matches Sleeper exactly.
  `statDelta` diffs two stat lines; `describe` renders "+1 rec · +15 rec yds"
  with humanized bonus tags.
- **Tracker** (`live/tracker.js`): `pickMatchup` (bye / median-only weeks give
  no opponent), `watchList` (pid → leagues, side), `scoreboard`, `diffEvents`
  (one event per watched player whose points moved; first sighting becomes
  the baseline), `trimSnapshot`.
- **Lineups** (`lineups/core.js`): ESPN scoreboard → games with share of game
  remaining; kickoff windows; an exact Hungarian-algorithm best lineup over
  flex chains; per-player single-swap options with "via" slides; notes for
  bye / Out / Questionable starters. `OUT = Out, IR, PUP, Sus, NA, Doubtful`.
- **Alerts** (`alerts/core.js`): ESPN injury feed parse; one alert per starter
  who is out or on bye before lock; de-duplicated per week.
- **Bets** (`bets/core.js`): 23 Sleeper Picks markets mapped to stat keys;
  payout multipliers → de-vigged over probability; decimal → American odds;
  DraftKings milestone ladders; implied team totals from "JAX -7.5" + total;
  defense-vs-position ranks; live progress against each line; hit rate over
  recent games; three sorts (TD chance, hit rate, projection lean).
- **Season** (`season/core.js`): optimal lineup per week, biggest miss,
  all-play record, standings with median game, normal-CDF win probability,
  seeded Monte-Carlo playoff odds, "as it stands" live week, weeks recorded,
  draft order (0.3 wins + 0.7 max points, linear and inverse), traded-pick
  owners, power ratings.
- **Draft** (`draft/*.js`): slot for a user, slot on the clock (snake reverses
  even rounds; the extension does not handle 3RR), name normalization with
  suffix/accents stripping, an index by name and by last name + position + team.

## Features by surface

| Extension | iOS |
| --- | --- |
| Live: cross-league play feed with per-league impact and net, scoreboard, play pop-up stage, Feed / Matchups / Games tabs, league exclusion | Tab 1 RedZone |
| Lineups: kickoff windows, best-lineup gain, swap options, Edit lineup link | Tab 2 Lineup HQ (+ exposure matrix) |
| Bets: Sleeper Picks lines, DK milestones, game lines, matchup ranks, live progress | Tab 3 Vegas Edge |
| Draft: big board vs rankings, on-the-clock banner, picked-by-me marks | Tab 4 Draft War Room |
| Season: standings, luck, power, playoff odds, draft order | engine ported to `@nightowl/core` (`seasonEngine`); no tab in the four-tab spec |
| Background: 15-minute lineup alerts, closing-line capture | foreground refresh + Live Activity (no background fetch in v1) |

## Where the extension and the port spec disagree

1. **Play-by-play source.** The extension never reads ESPN play-by-play; it
   diffs Sleeper's live stat lines every 15 s. The spec's ESPN `summary`
   pipeline is implemented as written, and the Sleeper stat-diff engine is
   kept as `statTracker` because it is exact for every league's custom
   scoring (including bonuses the play parser can't see).
2. **Odds source.** The extension uses ESPN/DraftKings props and Sleeper Picks
   lines, both keyless, and so does the app. The spec's Odds API and
   Cloudflare Worker were built, then removed: they added a paid key, quota
   and a deploy for slightly sharper prices.
3. **`settings.type`.** Sleeper uses `0` redraft, `1` keeper, `2` dynasty (the
   spec is right; the crawler's CLAUDE.md is not).
4. **3RR.** Sleeper encodes third-round reversal as a snake draft with
   `settings.reversal_round = 3`; there is no `type: '3rr'`. The grid engine
   accepts both.
5. **Deep-link fallback** in the spec has a Markdown-mangled URL; the port
   uses `https://sleeper.com/leagues/{id}/team`.
