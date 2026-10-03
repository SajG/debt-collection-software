import { supabase } from "./supabase";

// SY35 — POST /api/account/delete with the signed-in user's access token.
// Never throws; every outcome is folded into the union.

const BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export type DeleteAccountResult =
  | { ok: true }
  | { owner: true; companies: string[]; message: string }
  | { error: string };

export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  if (!BASE) return { error: "EXPO_PUBLIC_APP_URL is not set." };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "You're signed out. Sign in again and retry." };

  try {
    const res = await fetch(`${BASE}/api/account/delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      code?: string;
      companies?: string[];
    };
    if (res.ok && json.ok) return { ok: true };
    if (res.status === 409 && json.code === "owner") {
      return { owner: true, companies: json.companies ?? [], message: json.error ?? "" };
    }
    return { error: json.error ?? `Request failed (${res.status}).` };
  } catch {
    return { error: "No connection. Try again when you're online." };
  }
}
