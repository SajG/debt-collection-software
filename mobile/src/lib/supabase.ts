import "react-native-url-polyfill/auto";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import type { Database } from "./database.types";

// SecureStore has a ~2 KB per-key limit on iOS. Supabase JWTs and refresh
// tokens sit well under that today; if that ever changes we'd add a
// chunked adapter here rather than fall back to AsyncStorage.
const secureStoreAdapter: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill them in before running expo start.",
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Mobile deep-link OAuth is unused — phone OTP only. Leaving this on
    // would make the client try to parse URLs it will never see.
    detectSessionInUrl: false,
  },
});

// Supabase-recommended pattern for React Native: pause token refresh when
// the app is backgrounded so we don't fight the OS for cycles, resume on
// foreground. Registered as a side effect at import time — the client is
// a singleton so this only runs once.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
