# CLAUDE.md

Night Owl for iOS: an npm-workspaces monorepo porting the Night Owl Chrome extension (Treys21/NightOwl) to an Expo app. See README.md for layout and setup, docs/AUDIT.md for what the extension does.

## Commands

```bash
npm run verify                                   # typecheck + tests, all workspaces
npm test --workspace=@nightowl/core              # Vitest, packages/core/src/__tests__
npm run typecheck --workspace=@nightowl/mobile   # strict tsc for the app
cd apps/mobile && npx expo export --platform ios # Metro bundle check, no Xcode needed
cd apps/mobile && npx expo prebuild -p ios       # regenerate ios/ (gitignored)
```

## Rules

- Every package compiles under `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. No `any`.
- Pure logic goes in `packages/core` with tests; the app imports it as `@nightowl/core` (TypeScript source, no build step).
- No server and no API keys: every feed (Sleeper, ESPN) is public and called from the device. Odds are ESPN/DraftKings lines priced with Sleeper Picks payouts.
- Sleeper is read-only and keyed by username; never ask for a password. Lineup edits deep-link to `sleeper://league/{id}` (web fallback `https://sleeper.com/leagues/{id}/team`).
- Sleeper `settings.type`: 0 redraft, 1 keeper, 2 dynasty. Third-round reversal is `type: 'snake'` with `settings.reversal_round = 3`.
- Sleeper stat rows already carry bonus keys, so `statLinePoints` (Σ stat × weight) matches Sleeper exactly; prefer it over re-deriving bonuses.
- Expo changes every SDK: check the installed package's types or https://docs.expo.dev/versions/v57.0.0/ before using an Expo API. Install native packages with `npx expo install`.
- Never edit `apps/mobile/ios/`; change `app.json`, the local module in `modules/`, or `targets/` and re-run prebuild.
- `NightOwlAttributes.swift` exists twice (module and widget target) and must stay identical.
