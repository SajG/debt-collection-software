#!/usr/bin/env node
// Build-time gate. Fails the build if a production EAS profile is
// carrying dev-only credentials (EXPO_PUBLIC_DEV_TEST_*), which would
// otherwise ship the password + phone + OTP in every installed
// bundle. Expo inlines EXPO_PUBLIC_* strings at build time — a null
// value is compiled to undefined and the dev button never appears;
// a non-null value bundles the secret regardless of the __DEV__
// runtime gate.
//
// Wired into mobile/package.json as the "prebuild" script so both
// `npm run build:apk:preview` and any EAS profile call it.
//
// Only fails when EAS_BUILD_PROFILE looks like a release build.
// Local `npm start` (Expo Go / dev-client) is untouched — that's
// exactly where the dev shortcut is useful.

const profile = process.env.EAS_BUILD_PROFILE ?? "";
const isRelease =
  process.env.EAS_BUILD === "true" &&
  (profile === "production" || profile === "release");

if (!isRelease) {
  process.exit(0);
}

const forbidden = [
  "EXPO_PUBLIC_DEV_TEST_EMAIL",
  "EXPO_PUBLIC_DEV_TEST_PASSWORD",
  "EXPO_PUBLIC_DEV_TEST_PHONE",
  "EXPO_PUBLIC_DEV_TEST_OTP",
];

const leaks = forbidden.filter((k) => !!process.env[k]);
if (leaks.length > 0) {
  console.error(
    "\n[assert-no-dev-secrets] Refusing to build profile '" +
      profile +
      "' with dev-only env vars set:\n" +
      leaks.map((k) => "  - " + k).join("\n") +
      "\n\nRemove them from the profile's env (eas.json or the EAS " +
      "dashboard). These would be inlined into the JS bundle by Expo " +
      "and shipped to every device.\n",
  );
  process.exit(1);
}
