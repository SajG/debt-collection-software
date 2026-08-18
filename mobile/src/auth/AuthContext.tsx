import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database, Role } from "@/lib/database.types";

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
    setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Cold start: rehydrate whatever session lives in SecureStore.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    // Warm updates: sign-in / sign-out / token refresh all flow through here.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) await loadProfile(s.user.id);
      else setProfile(null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
