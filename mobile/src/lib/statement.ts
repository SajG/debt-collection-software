import { Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { supabase } from "./supabase";
import { t } from "./i18n";

// Statement of account for one customer (SY29). The server signs a
// 7-day link (GET /api/mobile/parties/:id/statement-link); the PDF
// behind it is downloaded to the cache and handed to the share sheet so
// it can go out on WhatsApp as a document. When the download or the
// file share is not possible, the link itself is shared as text — the
// customer can open it for 7 days without signing in.

const BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export async function shareStatement(
  partyId: string,
  customerName: string,
): Promise<{ ok: true } | { error: string }> {
  if (!BASE) return { error: t("common.expoPublicAppUrlIs") };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: t("error.auth") };

  let url: string;
  let days: number;
  try {
    const res = await fetch(`${BASE}/api/mobile/parties/${encodeURIComponent(partyId)}/statement-link`, {
      // i18n-ignore: HTTP header
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      expiresInDays?: number;
    };
    if (!res.ok || !body.url) return { error: t("statement.failed") };
    url = body.url;
    days = body.expiresInDays ?? 7;
  } catch {
    return { error: t("error.network") };
  }

  try {
    const safeName = customerName.replace(/[^\w.-]+/g, "_").slice(0, 40) || "customer";
    const target = `${FileSystem.cacheDirectory ?? ""}Statement-${safeName}.pdf`;
    const dl = await FileSystem.downloadAsync(url, target);
    if (dl.status === 200 && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(dl.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: t("statement.title", { name: customerName }),
      });
      return { ok: true };
    }
  } catch {
    /* fall through to sharing the link */
  }

  try {
    await Share.share({
      message: t("statement.linkMessage", { name: customerName, days, url }),
    });
    return { ok: true };
  } catch {
    return { error: t("statement.failed") };
  }
}
