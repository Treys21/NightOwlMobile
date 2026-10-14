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

### No server

Everything comes from public feeds, straight from the phone: Sleeper for leagues, rosters, matchups, players and Picks lines; ESPN for the scoreboard, play-by-play and DraftKings lines. The player directory (~5 MB) is fetched at most once a day, trimmed to active fantasy players and kept in SQLite. There are no API keys and nothing to deploy.

## Verification

| Gate | Command | Status |
| --- | --- | --- |
| 0 | `npm install && npm run typecheck --workspaces` | passes |
| 1 | `npm test --workspace=@nightowl/core && npm run typecheck --workspace=@nightowl/core` | 100 tests |
| 3–5 | `npm run typecheck --workspace=@nightowl/mobile` | passes; iOS JS bundle builds with `expo export` |
| 6 | `npm test --workspaces && npm run typecheck --workspaces && npx expo prebuild --platform ios` | passes; pods install, widget target and App Group generated |

The ESPN play parser was checked against four real 2026 week 5 box scores: 320 of 324 passing, rushing and receiving stat cells match exactly (the rest are a fullback Sleeper doesn't list and one fumble whose yardage ESPN credits differently).

Built and run with Xcode 27 on an iPhone 18 Pro simulator (iOS 27) against live Sleeper and ESPN data: all four tabs render real leagues, alerts, lines and drafts. The device build (`-sdk iphoneos`, unsigned) compiles the ActivityKit module and embeds the widget extension.

Not yet verified: the Live Activity on screen (it starts only while games are live), a signed build on a physical iPhone, and the feed during real games.

### Simulator runs

The iOS 27 SDK requires the UIScene life cycle; `plugins/withSceneLifecycle.js` adapts Expo's generated AppDelegate on every prebuild. For runs without typing or tapping, the app reads two launch arguments:

```bash
xcrun simctl launch booted com.nightowl.ios -NightOwlConnectUsername <sleeper username>
xcrun simctl launch booted com.nightowl.ios -NightOwlOpenRoute /lineups   # /vegas, /drafts
```

`nightowl://connect?username=<name>` does the same setup from a link.
