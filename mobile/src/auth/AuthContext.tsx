import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database, Role } from "@/lib/database.types";

// Idle sign-out. Field phones get lost; a device sitting idle for
// more than IDLE_TIMEOUT_MS wakes up signed out and has to re-auth.
// Independent of Supabase's own refresh-token TTL — this is the
// physical-device layer.
const IDLE_STORAGE_KEY = "synworks:lastActiveAt";
const IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Profile = Database["public"]["Tables"]["Profile"]["Row"];

type AuthValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const ALLOWED_ROLES: Role[] = ["ADMIN", "STAFF", "FACTORY"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    // If RLS blocks or the Profile row hasn't been created yet, this
    // returns { data: null, error: null } via maybeSingle. In that
    // case — or if the row exists but the role isn't one we support —
    // sign the user out defensively so no screen renders with an
    // ambiguous identity.
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
      // No profile row — probably a new phone number not yet provisioned.
      // Bounce back to the phone screen; sign out so onAuthStateChange
      // clears the session and the root gate does the right thing.
      await supabase.auth.signOut();
      return;
    }
    if (!ALLOWED_ROLES.includes(data.role as Role)) {
      setProfile(null);
      await supabase.auth.signOut();
      return;
    }
    // Deactivated by an admin — route to the disabled screen first,
    // then sign out so the user sees the explanation before the
    // session is torn down. current_user_role() also returns NULL on
    // the server for this case so RLS denies everything regardless.
    if (data.isActive === false) {
      setProfile(null);
      try {
        router.replace("/account-disabled");
      } catch {
        /* router not ready pre-mount; sign-out fallback still runs */
      }
      await supabase.auth.signOut();
      return;
    }
    setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootWithIdleCheck() {
      // Idle-timeout enforcement — read the last-active stamp before
      // we hand the session back to consumers. If the device has been
      // idle past the threshold, force sign-out; the root gate then
      // routes to /(auth)/phone.
      const rawStamp = await AsyncStorage.getItem(IDLE_STORAGE_KEY);
      const now = Date.now();
      const stamp = rawStamp ? Number(rawStamp) : NaN;
      const idleFor = Number.isFinite(stamp) ? now - stamp : 0;
      if (Number.isFinite(stamp) && idleFor > IDLE_TIMEOUT_MS) {
        await supabase.auth.signOut();
        await AsyncStorage.removeItem(IDLE_STORAGE_KEY);
        if (mounted) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    }
    void bootWithIdleCheck();

    // Warm updates: sign-in / sign-out / token refresh all flow through here.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        await loadProfile(s.user.id);
        await AsyncStorage.setItem(IDLE_STORAGE_KEY, String(Date.now()));
      } else {
        setProfile(null);
      }
    });

    // Refresh the last-active stamp every time the app comes to the
    // foreground. AppState 'active' also fires on cold start via the
    // subscription API so we don't double-count with bootWithIdleCheck.
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void AsyncStorage.setItem(IDLE_STORAGE_KEY, String(Date.now()));
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      appSub.remove();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // The root gate at "/" reads session state and routes to
    // /(auth)/phone when there's no session. Without this replace
    // the user stays sitting on /(staff) or /(factory) with a
    // signed-out client — nothing tells expo-router to leave.
    try {
      router.replace("/");
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
      signOut,
      reloadProfile,
    }),
    [loading, session, profile, signOut, reloadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
