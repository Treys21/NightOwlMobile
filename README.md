# Night Owl for iOS

The [Night Owl](https://github.com/Treys21/NightOwl) Chrome extension, rebuilt as a native-feeling iPhone app for Sleeper fantasy football:

- **RedZone**: every play that moves any of your matchups, scored under each league's own rules, netted across leagues.
- **Lineups**: starters who are out, on bye or questionable, bench players Vegas likes more, and a cross-league exposure matrix with one-tap jumps into the Sleeper app.
- **Vegas**: sportsbook lines turned into implied fantasy points per league, bench upgrades, a head-to-head flex comparator and every game's environment.
- **Drafts**: a live, zoomable draft board with an on-the-clock alert and best available showing your portfolio exposure.
- **Live Activity**: your record across leagues and the latest play on the Lock Screen and Dynamic Island.

No password, ever. Sleeper's API is public and read-only, so Night Owl only needs a username. Lineup changes happen in Sleeper's own app.

## Layout

```
packages/core     Pure TypeScript: types, API clients, scoring, play parsing, index, audit, Vegas, draft math (Vitest)
apps/bff-proxy    Cloudflare Worker: slim player directory (ETag) and the weekly Vegas slate (KV cache)
apps/mobile       Expo SDK 57 app: expo-router tabs, NativeWind, SQLite, MMKV, Zustand, TanStack Query
apps/mobile/modules/nightowl-live-activity   Local Expo module bridging ActivityKit
apps/mobile/targets/widgets                  Widget extension with the Live Activity UI (SwiftUI)
docs/AUDIT.md     What the Chrome extension does and where the port differs
```

## Develop

Requires Node 22+ (tested on 25), and for device builds Xcode 16+ and CocoaPods.

```bash
npm install
npm run verify                              # typecheck + tests, every workspace
cd apps/mobile && npx expo prebuild -p ios  # generate ios/ (not committed)
npx expo run:ios                            # build and run on a simulator or device
```

Set `ios.appleTeamId` in `apps/mobile/app.json` before building for a device; the widget extension and the App Group (`group.com.nightowl.ios`) need it for signing. Live Activities need iOS 16.2+ and a development build (Expo Go has no ActivityKit module; the app runs there without it).

### Odds and the BFF

The app works with no server: odds come from DraftKings lines on ESPN, priced with Sleeper Picks payouts, and the player directory comes straight from Sleeper and is trimmed on the device.

To use the Worker instead (smaller player download, The Odds API prices):

```bash
cd apps/bff-proxy
npx wrangler kv namespace create NIGHTOWL_KV   # paste the id into wrangler.toml
npx wrangler secret put ODDS_API_KEY           # optional
npx wrangler deploy
```

Then set `EXPO_PUBLIC_BFF_URL=https://<your-worker>.workers.dev` for the app. Without `ODDS_API_KEY` the Worker serves the same keyless slate the app builds itself. With it, the 15-minute prewarm cron spends Odds API credits on every game that kicks off within 36 hours; check your plan's quota.

## Verification

| Gate | Command | Status |
| --- | --- | --- |
| 0 | `npm install && npm run typecheck --workspaces` | passes |
| 1 | `npm test --workspace=@nightowl/core && npm run typecheck --workspace=@nightowl/core` | 101 tests |
| 2 | `npm run typecheck --workspace=@nightowl/bff-proxy` | passes; 5 Worker tests; bundles with `wrangler deploy --dry-run` |
| 3–5 | `npm run typecheck --workspace=@nightowl/mobile` | passes; iOS JS bundle builds with `expo export` |
| 6 | `npm test --workspaces && npm run typecheck --workspaces && npx expo prebuild --platform ios` | passes; pods install, widget target and App Group generated |

The ESPN play parser was checked against four real 2026 week 5 box scores: 320 of 324 passing, rushing and receiving stat cells match exactly (the rest are a fullback Sleeper doesn't list and one fumble whose yardage ESPN credits differently).

Not yet verified: the Swift (ActivityKit module and widget) has not been compiled, because the machine that built this has no Xcode; the UI has not been run on a simulator or device; and the live feed has not been watched during real games.
