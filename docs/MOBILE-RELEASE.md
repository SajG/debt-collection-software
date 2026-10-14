# Mobile release flow

How a change gets from this repo to people's phones. Listing text and reviewer
access: [PLAY-STORE.md](./PLAY-STORE.md), [APP-STORE.md](./APP-STORE.md).

All commands run in `mobile/`.

## The one rule: store build or OTA?

| The change touches… | Ship it as |
|---|---|
| Only JavaScript/TypeScript, translations, images bundled by Metro | **OTA update** to the same `runtimeVersion` |
| `app.json` (permissions, plugins, icons, splash, bundle ids), `package.json` dependencies with native code, Expo SDK version, anything under `android/` or `ios/` | **New store build** with a higher `version` |

`runtimeVersion` uses the `appVersion` policy, so it equals `expo.version` in
`app.json` (today `1.0.0`). An OTA update only reaches phones whose installed
build has the same `version`. Therefore:

- Never bump `version` for an OTA update.
- Always bump `version` (1.0.0 → 1.0.1) when native code or config changes.
  Older installs keep running their last compatible JS until they update from
  the store.
- An OTA update must not change what the store reviewed: bug fixes and copy
  fixes only. New features go through a store build and review.

If unsure, treat it as native. A JS update pushed to a build that lacks the
native half crashes on launch.

Build numbers are not edited by hand: `eas.json` has
`cli.appVersionSource: "remote"` and `production.autoIncrement: true`, so EAS
keeps Android `versionCode` and iOS `buildNumber` and raises them on every
production build.

## One-time setup

```
npm i -g eas-cli
eas login
eas init                 # links the Expo project, writes extra.eas.projectId
eas update:configure     # replaces PLACEHOLDER_EAS_PROJECT_ID in updates.url
eas credentials          # Android upload keystore; iOS distribution cert + profile
```

EAS secrets / environment for the `production` profile:
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_APP_URL` (= `https://getsyncit.app`), Sentry values or
`SENTRY_DISABLE_AUTO_UPLOAD=true`. Never set any `EXPO_PUBLIC_DEV_TEST_*` — the
`prebuild` script fails a production build that carries them.

Key files stay out of git (`mobile/.gitignore`): `play-service-account.json`,
`google-services.json`, any other `*.json` dropped in `mobile/`, `*.jks`,
`*.keystore`, `*.p8`, `*.p12`.

## Before every store build

```
npm run typecheck && npm run lint        # in mobile/
npm run review:seed                      # in repo root — fresh demo company
```

Check that `REVIEW_LOGIN_EMAILS` / `REVIEW_LOGIN_CODE` are set on the web
deployment, and that any new migration is applied.

## Google Play: internal → closed → production

1. **Build**
   ```
   eas build -p android --profile production
   ```
   Produces a signed AAB. It must finish without warnings.
2. **Internal testing** (up to 100 testers, available in minutes, no review)
   ```
   eas submit -p android --profile production      # track: internal
   ```
   Install from the internal-testing link. Smoke test: sign in with each review
   account, place an order, record a payment with a photo, switch to Hindi.
3. **Closed testing.** Play Console → promote the same release to a closed track
   with your pilot customers' emails. New personal developer accounts must run a
   closed test with at least 12 testers for 14 days before production access is
   granted; organisation accounts are not held to that. The first closed release
   goes through review — this is where the listing, Data safety form and App
   access credentials are checked.
4. **Production.** Promote the reviewed release. Start with a staged roll-out
   (20 %), watch crashes in Sentry and Play vitals for a day, then go to 100 %.
5. When the listing is public, set `ANDROID_LIVE="true"` on the web deployment
   and redeploy; `/download` then shows the Google Play button.

Never upload a different AAB to production than the one tested — promote the
release, don't rebuild.

## Apple: TestFlight → App Review

Do this after the same version is approved on Play.

1. `eas build -p ios --profile production`
2. `eas submit -p ios --profile production` — the build appears in TestFlight
   after processing (10–30 minutes).
3. **TestFlight.** Internal testers (your team) get it at once. External testers
   need a short Beta App Review the first time.
4. **App Review.** In App Store Connect select the TestFlight build, fill the
   review notes from APP-STORE.md §6, submit. Choose "Manually release".
5. After approval, release, then set `IOS_LIVE="true"` and `IOS_APP_STORE_URL`
   on the web deployment and redeploy.

## OTA update (JS-only fix)

```
eas update --channel production --message "Fix: <what>"
```

- Goes to every install whose `version` matches `app.json` right now.
- Phones fetch it on the next cold start and apply it on the one after; the app
  also shows a "Restart to update" banner.
- Test first: `eas update --channel preview` and check on a preview build.
- Roll back: `eas update:republish --channel production` and pick the previous
  update.

## Forcing an update

For a security fix that must not wait for people to update: after the new build
is live in both stores, set **Minimum mobile app version** for the company
(`BusinessSettings.mobileMinAppVersion`). Older builds then show "Update
required" and nothing else.

## Version checklist

| | Edit | Who raises it |
|---|---|---|
| `expo.version` (also the runtime version) | `mobile/app.json` | You, for every store build with native/config changes |
| Android `versionCode`, iOS `buildNumber` | nowhere | EAS, automatically |
