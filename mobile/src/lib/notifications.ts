import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { router } from "expo-router";
import { supabase } from "./supabase";
import { useAuth } from "@/auth/AuthContext";

// Push notifications. Registration is idempotent: on every mount of
// the authenticated app, we ask for a token and upsert it into the
// PushToken table (RLS scoped to auth.uid()). The edge function
// `notify` reads that table when a Postgres trigger fires and pushes
// via Expo's service. Stale tokens are cleaned up server-side when
// Expo returns DeviceNotRegistered.
//
// Uses expo-notifications only (no third-party SDK).

// Foreground presentation: still show the banner + play sound while
// the app is in the foreground. Salesperson may have the app open
// while walking around; the point is that they hear it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Order updates",
    importance: Notifications.AndroidImportance.HIGH,
    // Bright color used for the small icon on the status bar.
    lightColor: "#093D30",
    sound: "default",
  });
}

async function getProjectId(): Promise<string | undefined> {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  const easCfg = Constants.easConfig as { projectId?: string } | undefined;
  return extra?.eas?.projectId ?? easCfg?.projectId ?? undefined;
}

async function requestAndRegisterToken(profileId: string): Promise<void> {
  if (!Device.isDevice) return; // simulators can't receive push
  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return;

  let token: string;
  try {
    const projectId = await getProjectId();
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch (e) {
    // On Expo Go with SDK 53+ the token endpoint requires a projectId;
    // on a dev-client without one, log and skip rather than crash the
    // sign-in flow.
    console.warn("push token unavailable:", e);
    return;
  }

  const platform: "ios" | "android" | "web" =
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "web";

  const now = new Date().toISOString();
  // Upsert on token so re-registrations bump lastSeenAt rather than
  // duplicating rows. Since token is UNIQUE, on-conflict picks the
  // right row even if profileId changed (rare — user re-installed).
  const { error } = await supabase
    .from("PushToken")
    .upsert(
      {
        id: `push_${token.slice(-24)}`,
        profileId,
        token,
        platform,
        lastSeenAt: now,
      },
      { onConflict: "token" },
    );
  if (error) console.warn("push token upsert failed:", error.message);
}

function routeFromNotification(data: any) {
  const salesOrderId = data?.salesOrderId;
  const url = typeof data?.url === "string" ? data.url : null;

  if (salesOrderId) {
    // The staff detail route is the shared one; factory nav will
    // still work because its own /orders/[id] handles the same
    // navigation intent from its group.
    router.push({
      pathname: "/(staff)/orders/[id]",
      params: { id: String(salesOrderId) },
    });
    return;
  }
  if (url) {
    // Fallback — expo-linking will parse the deep link and route.
    // (Not calling Linking.openURL here because we're already inside
    // the app; router.push handles internal URLs.)
    console.log("notification deep link (no salesOrderId):", url);
  }
}

/**
 * Mount inside the authenticated tree — registers a token when the
 * user has a valid session + Profile and installs a tap handler that
 * routes to the deep-linked order. Safe to call from a shared
 * ancestor; internal effects re-run only when the profile id changes.
 */
export function usePushRegistration(): void {
  const { profile } = useAuth();
  const responseSubRef = useRef<Notifications.EventSubscription | null>(null);

  // Register on sign-in.
  useEffect(() => {
    if (!profile) return;
    void requestAndRegisterToken(profile.id);
  }, [profile?.id]);

  // Handle taps (background → foreground via notification).
  useEffect(() => {
    responseSubRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        routeFromNotification(response.notification.request.content.data);
      });

    // Cold-start case: app was killed and re-launched by a tap.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) routeFromNotification(response.notification.request.content.data);
    });

    return () => {
      responseSubRef.current?.remove();
      responseSubRef.current = null;
    };
  }, []);
}
