import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";
import { getLanguage } from "./i18n";

// SY38 — product analytics from the phone (PostHog).
//
//   EXPO_PUBLIC_POSTHOG_KEY    project key; unset = nothing is sent
//   EXPO_PUBLIC_POSTHOG_HOST   https://eu.i.posthog.com (default) or
//                              https://us.i.posthog.com
//
// Plain fetch, no SDK and no native module. A person is identified by
// their Profile id and grouped by organizationId — the same ids the web
// uses. Nothing typed into the app is ever sent: no customer names, no
// amounts, no phone numbers. The only properties are the app version,
// the platform, the language and the role.
//
// The business events (first_order_placed, first_payment_recorded) are
// decided on the server, which knows whether it really is the company's
// first: after a save the app calls pingMilestones().

const KEY = (process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "").trim();
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com")
  .trim()
  .replace(/\/+$/, "");
const APP_URL = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

let organizationId: string | null | undefined;

async function currentOrg(): Promise<string | null> {
  if (organizationId !== undefined) return organizationId;
  try {
    const { data } = await (supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: string | null }>)("current_org_id");
    organizationId = data ?? null;
  } catch {
    organizationId = null;
  }
  return organizationId;
}

/** Forget the cached company (call on sign-out). */
export function resetAnalytics(): void {
  organizationId = undefined;
  openedFor = null;
}

type MobileEvent = "app_opened" | "language_changed";

export async function track(
  event: MobileEvent,
  profileId: string,
  role: string | null,
): Promise<void> {
  if (!KEY) return;
  try {
    const org = await currentOrg();
    await fetch(`${HOST}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: KEY,
        event,
        distinct_id: profileId,
        properties: {
          ...(org ? { $groups: { organization: org } } : {}),
          platform: Platform.OS,
          app_version: Constants.expoConfig?.version ?? "0",
          language: getLanguage(),
          ...(role ? { role: role.toLowerCase() } : {}),
          $geoip_disable: true,
          $lib: "syncit-mobile",
        },
      }),
    });
  } catch {
    /* offline — analytics never retries or queues */
  }
}

let openedFor: string | null = null;

/** Once per signed-in session. */
export function trackAppOpened(profileId: string, role: string | null): void {
  if (openedFor === profileId) return;
  openedFor = profileId;
  void track("app_opened", profileId, role);
}

/**
 * Tell the server "something was just saved" so it can record a
 * first-order / first-payment milestone for the company. Carries no
 * data — the server looks at the caller's own company. Fire and forget.
 */
export function pingMilestones(): void {
  if (!APP_URL) return;
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch(`${APP_URL}/api/mobile/milestones`, {
        method: "POST",
        // i18n-ignore: HTTP header
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      /* the daily server pass catches up */
    }
  })();
}
