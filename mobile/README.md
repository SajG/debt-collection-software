# PayTrack Sales — mobile app

React Native (Expo, TypeScript) companion app for adhesives-industry
salespeople. Talks to the same Supabase project as the PayTrack web app;
row-level security scopes each user to their own orders.

## Design principles (enforced across every screen)

- Minimum tap target 56 px (`theme.tap`).
- Body text ≥ 16 px, high contrast (`theme.type.body` = 18).
- Two taps max from home to any action.
- Native `Alert` confirmations for destructive / final actions.
- All copy through `t()` so Hindi / Marathi can be added later without touching screens.

## First-time setup

```bash
cd mobile
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

# generate placeholder icon/splash PNGs (only if missing / for a fresh clone)
npm run assets:placeholder

# start Expo Go dev server
npm start
```

## Supabase side (one-time)

1. **Enable phone auth** in Supabase dashboard → Authentication → Providers → Phone. Wire an SMS provider (Twilio / MessageBird / Vonage — required for OTP delivery).
2. **Apply the RLS migration** from the main repo: `npm run db:rls` (in the root project). Without it, mobile users can read anyone's rows.
3. **Regenerate DB types** whenever the Prisma schema changes:
   ```bash
   export SUPABASE_PROJECT_ID=your_project_id
   npm run types:generate
   ```
   Overwrites `src/lib/database.types.ts`. The current file is hand-authored to match `prisma/schema.prisma` and is a safe drop-in target.

## Building an APK

Cloud (EAS):

```bash
npx eas login
npx eas build:configure   # first time only
npx eas build --platform android --profile preview
```

Local (needs Android SDK + JDK 17):

```bash
npx expo prebuild --clean
cd android && ./gradlew assembleRelease
# APK lands in android/app/build/outputs/apk/release/
```

`eas.json` is preconfigured to output APKs on every profile (not AABs)
so field-tester installs are one-tap.

## Roles

- **STAFF** — routed to `/(staff)` home. Only role fully supported today.
- **ADMIN / FACTORY** — see the `/unsupported-role` screen with a message directing them to the web console.

## Adding a language

1. Add a new key (e.g. `"hi"`) to `dictionaries` in `src/lib/i18n.ts`, cloning the full `en` shape.
2. Translate value by value; missing keys automatically fall back to English.
3. Wire a language switcher via `setLanguage("hi")`. (Reactive re-render on language change is a follow-up — today the language is read at each `t()` call, so a small context+state upgrade there is enough.)
