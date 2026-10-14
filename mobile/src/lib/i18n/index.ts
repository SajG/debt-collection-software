import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { en, type Key } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";

// In-memory i18n with a persisted language. Every user-facing string
// goes through t(); `npm run check:i18n` fails the build when one is
// hard-coded. hi/mr are typed Record<Key, string>, so a key added to
// en.ts without a translation is a type error.
//
// The language is read once before the first screen renders
// (initLanguage, awaited by the root layout) and the root navigator is
// keyed on it, so a change in Settings remounts every screen in the new
// language without losing the current route.

export type { Key };
export type Language = "en" | "hi" | "mr";

/** Names are written in their own script so a reader who knows only
 *  that language can find it. */
export const LANGUAGES: readonly { value: Language; nativeName: string }[] = [
  { value: "en", nativeName: "English" },
  { value: "hi", nativeName: "हिन्दी" },
  { value: "mr", nativeName: "मराठी" },
];

const dictionaries: Record<Language, Record<Key, string>> = { en, hi, mr };

const STORAGE_KEY = "syncit:language";

let current: Language = "en";
const listeners = new Set<() => void>();

function isLanguage(v: unknown): v is Language {
  return v === "en" || v === "hi" || v === "mr";
}

/** Stored choice wins; otherwise follow the phone's language when it is
 *  one we ship. Never throws — a storage fault leaves English. */
export async function initLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) {
      current = stored;
      return;
    }
    const device = getLocales()[0]?.languageCode;
    if (isLanguage(device)) current = device;
  } catch {
    /* keep default */
  }
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  void AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => undefined);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller when the language changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const template = dictionaries[current][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}

type PluralBase = {
  [K in Key]: K extends `${infer B}.one` ? B : never;
}[Key];

/** Picks `<base>.one` for exactly 1 and `<base>.other` otherwise, and
 *  passes the count in as {count}. */
export function tn(
  base: PluralBase,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const key = `${base}.${count === 1 ? "one" : "other"}` as Key;
  return t(key, { count, ...vars });
}

/** BCP-47 tag for dates. Digits stay Latin (‑u‑nu‑latn) so amounts and
 *  dates read the same in every language. */
export function dateLocale(): string {
  return current === "en" ? "en-IN" : `${current}-IN-u-nu-latn`;
}
