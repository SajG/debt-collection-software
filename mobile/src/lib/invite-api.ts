// SY42 — the two token-authenticated calls behind the Join screen.
// See app/api/auth/invite/route.ts on the web side.

const BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export type InvitePreview = {
  email: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
  companyName: string;
  inviterName: string | null;
  ownerName: string | null;
  accountExists: boolean;
};

export type PreviewResult =
  | { ok: true; invite: InvitePreview }
  | { ok: false; reason: "invalid" | "network" };

export async function fetchInvite(token: string): Promise<PreviewResult> {
  if (!BASE) return { ok: false, reason: "network" };
  try {
    const res = await fetch(`${BASE}/api/auth/invite?token=${encodeURIComponent(token)}`);
    if (res.status === 404 || res.status === 400) return { ok: false, reason: "invalid" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true, invite: (await res.json()) as InvitePreview };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type AcceptResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "exists" | "network" | "rejected"; message: string | null };

export async function acceptInvite(input: {
  token: string;
  ownerName: string;
  phone?: string;
  password: string;
}): Promise<AcceptResult> {
  if (!BASE) return { ok: false, reason: "network", message: null };
  try {
    const res = await fetch(`${BASE}/api/auth/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      email?: string;
      error?: string;
      message?: string;
    };
    if (res.ok && body.ok && body.email) return { ok: true, email: body.email };
    if (res.status === 404) return { ok: false, reason: "invalid", message: null };
    if (body.error === "exists") return { ok: false, reason: "exists", message: null };
    // Validation / weak password / seat limit: the server's own words.
    return { ok: false, reason: "rejected", message: body.message ?? body.error ?? null };
  } catch {
    return { ok: false, reason: "network", message: null };
  }
}
