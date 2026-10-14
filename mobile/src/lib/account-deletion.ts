import { supabase } from "./supabase";
import { t } from "@/lib/i18n";

// SY35 — POST /api/account/delete with the signed-in user's access token.
// Never throws; every outcome is folded into the union.

const BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export type DeleteAccountResult =
  | { ok: true }
  | { owner: true; companies: string[]; message: string }
  | { error: string };

export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  if (!BASE) return { error: t("common.expoPublicAppUrlIs") };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: t("accountDeletion.youreSignedOutSignIn") };

  try {
    const res = await fetch(`${BASE}/api/account/delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // i18n-ignore: HTTP header
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
    return { error: json.error ?? t("accountDeletion.requestFailed", { status: res.status }) };
  } catch {
    return { error: t("accountDeletion.noConnectionTryAgainWhen") };
  }
}
