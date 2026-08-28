import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { invalidateProfileDirectory } from "@/lib/profile-directory";
import type { Database, Role } from "@/lib/database.types";
import {
  clearDeviceId,
  clearLock,
  getDeviceId,
  getLockKind,
  shouldPromptForUnlock,
} from "@/auth/device-lock";

// Two layers of "am I signed in":
//
//   1. Supabase session — lives in SecureStore, refreshed by the SDK.
//   2. Device lock — biometric or PIN. Cold start locks; the app
//      also re-locks after 5 minutes in the background.
//
// Idle sign-out layer sits on top of both: 7 days of no foreground
// activity forces the whole session away and clears the local lock,
// so a lost phone re-enrols from scratch.

const IDLE_STORAGE_KEY = "syncit:lastActiveAt";
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (was 30 pre-SY1)

// Absolute session lifetime (SY7). No matter how active the phone is,
// after 90 days the local session is wiped and re-enrolment is
// required. Independent of Supabase's own refresh-token TTL — this
// enforces a floor at the physical-device layer.
const AUTHENTICATED_SINCE_KEY = "syncit:authenticatedSince";
const ABSOLUTE_SESSION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

type Profile = Database["public"]["Tables"]["Profile"]["Row"];

type AuthValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  locked: boolean;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  markUnlocked: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

const ALLOWED_ROLES: Role[] = ["ADMIN", "STAFF", "FACTORY"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // `locked` is true when a valid Supabase session exists but the
  // device lock (biometric / PIN) has not been satisfied for this
  // foreground stretch. The root gate reads this to route to /unlock.
  const [locked, setLocked] = useState(true);
  const lastBackgroundedAt = useRef<number | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("Profile")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      setProfile(null);
      await supabase.auth.signOut();
      return;
    }
    if (!data) {
      setProfile(null);
      await supabase.auth.signOut();
      return;
    }
    if (!ALLOWED_ROLES.includes(data.role as Role)) {
      setProfile(null);
      await supabase.auth.signOut();
      return;
    }
    if (data.isActive === false) {
      setProfile(null);
      try {
        router.replace("/account-disabled");
      } catch {
        /* router not ready pre-mount */
      }
      await supabase.auth.signOut();
      return;
    }
    setProfile(data);

    // Best-effort touch of the device's lastSeenAt so the admin's
    // devices page reflects reality. Non-blocking; ignore errors.
    void (async () => {
      const deviceId = await getDeviceId();
      if (!deviceId) return;
      try {
        // Types not yet regenerated for touch_device_seen (added in
        // migration 20260827180000_device_enrollment). Cast to loosen.
        await (supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>)("touch_device_seen", { p_device_id: deviceId });
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const evaluateLock = useCallback(async () => {
    const kind = await getLockKind();
    if (!kind) {
      // No lock configured yet — user just enrolled but hasn't picked
      // biometric/PIN. Treat as unlocked; /set-up-lock will handle it.
      setLocked(false);
      return;
    }
    setLocked(await shouldPromptForUnlock());
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootWithIdleCheck() {
      const rawStamp = await AsyncStorage.getItem(IDLE_STORAGE_KEY);
      const rawAuthSince = await AsyncStorage.getItem(AUTHENTICATED_SINCE_KEY);
      const now = Date.now();
      const stamp = rawStamp ? Number(rawStamp) : NaN;
      const authSince = rawAuthSince ? Number(rawAuthSince) : NaN;
      const idleFor = Number.isFinite(stamp) ? now - stamp : 0;
      const sessionAge = Number.isFinite(authSince) ? now - authSince : 0;
      const idleExpired =
        Number.isFinite(stamp) && idleFor > IDLE_TIMEOUT_MS;
      const absoluteExpired =
        Number.isFinite(authSince) && sessionAge > ABSOLUTE_SESSION_MS;
      if (idleExpired || absoluteExpired) {
        // Nuke everything, force re-enrolment. `absoluteExpired`
        // fires even for an active daily user — the 90-day cap is
        // the point of the setting.
        await supabase.auth.signOut();
        await AsyncStorage.multiRemove([
          IDLE_STORAGE_KEY,
          AUTHENTICATED_SINCE_KEY,
        ]);
        await clearLock();
        await clearDeviceId();
        if (mounted) {
          setSession(null);
          setProfile(null);
          setLocked(true);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
        await evaluateLock();
      } else {
        setLocked(true);
      }
      setLoading(false);
    }
    void bootWithIdleCheck();

    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        await loadProfile(s.user.id);
        await AsyncStorage.setItem(IDLE_STORAGE_KEY, String(Date.now()));
        // Only stamp authenticatedSince on the first sign-in of a
        // session — token refreshes must not extend the absolute
        // floor. SIGNED_IN fires once on fresh sign-in; TOKEN_REFRESHED
        // fires on every renewal.
        if (evt === "SIGNED_IN") {
          const existing = await AsyncStorage.getItem(
            AUTHENTICATED_SINCE_KEY,
          );
          if (!existing) {
            await AsyncStorage.setItem(
              AUTHENTICATED_SINCE_KEY,
              String(Date.now()),
            );
          }
        }
        await evaluateLock();
      } else {
        setProfile(null);
        setLocked(true);
      }
    });

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void AsyncStorage.setItem(IDLE_STORAGE_KEY, String(Date.now()));
        // If we came back from a long background stretch, re-engage
        // the lock so the root gate re-prompts for biometric/PIN.
        if (lastBackgroundedAt.current) {
          void evaluateLock();
        }
        lastBackgroundedAt.current = null;
      } else if (state === "background" || state === "inactive") {
        lastBackgroundedAt.current = Date.now();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      appSub.remove();
    };
  }, [loadProfile, evaluateLock]);

  const markUnlocked = useCallback(() => {
    setLocked(false);
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    setProfile(null);
    setLocked(true);
    invalidateProfileDirectory();
    await AsyncStorage.multiRemove([IDLE_STORAGE_KEY, AUTHENTICATED_SINCE_KEY]);
    // Clear the device-lock secrets so re-enrolment starts clean.
    // The Device row on the server stays (revoked or not) for audit —
    // only the local half is wiped here.
    await clearLock();
    await clearDeviceId();
    try {
      await supabase.auth.signOut();
    } catch {
      /* offline — local state is already correct */
    }
    try {
      if (typeof router.canDismiss === "function" && router.canDismiss()) {
        router.dismissAll();
      }
      router.replace("/(auth)/enroll");
    } catch {
      /* router not ready during tests */
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      locked,
      signOut,
      reloadProfile,
      markUnlocked,
    }),
    [loading, session, profile, locked, signOut, reloadProfile, markUnlocked],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
