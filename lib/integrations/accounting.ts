// SERVER-ONLY — cloud accounting OAuth2 (Zoho Books, QuickBooks, Xero).
// Tokens are AES-256-GCM encrypted at rest via lib/crypto.ts, decrypted
// here only. Data pulls map provider records into the exact row shape the
// CSV importer accepts and feed lib/import/ingest.ts — one ingestion path.

import type { AccountingProvider } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export type ProviderSlug = "zoho-books" | "quickbooks" | "xero";

export const PROVIDER_BY_SLUG: Record<ProviderSlug, AccountingProvider> = {
  "zoho-books": "ZOHO_BOOKS",
  quickbooks: "QUICKBOOKS",
  xero: "XERO",
};

export const PROVIDER_LABELS: Record<AccountingProvider, string> = {
  ZOHO_BOOKS: "Zoho Books",
  QUICKBOOKS: "QuickBooks Online",
  XERO: "Xero",
};

type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra query params on the authorize redirect. */
  authExtras?: Record<string, string>;
  /** "basic" = client id/secret in Authorization header; "body" = form fields. */
  tokenAuth: "basic" | "body";
};

// Zoho region is deployment config: India distributors live on .in.
const ZOHO_ACCOUNTS = process.env.ZOHO_ACCOUNTS_BASE ?? "https://accounts.zoho.in";
export const ZOHO_API_BASE = process.env.ZOHO_API_BASE ?? "https://www.zohoapis.in";

const CONFIGS: Record<AccountingProvider, ProviderConfig> = {
  ZOHO_BOOKS: {
    authUrl: `${ZOHO_ACCOUNTS}/oauth/v2/auth`,
    tokenUrl: `${ZOHO_ACCOUNTS}/oauth/v2/token`,
    scope: "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ",
    clientIdEnv: "ZOHO_CLIENT_ID",
    clientSecretEnv: "ZOHO_CLIENT_SECRET",
    authExtras: { access_type: "offline", prompt: "consent" },
    tokenAuth: "body",
  },
  QUICKBOOKS: {
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scope: "com.intuit.quickbooks.accounting",
    clientIdEnv: "QUICKBOOKS_CLIENT_ID",
    clientSecretEnv: "QUICKBOOKS_CLIENT_SECRET",
    tokenAuth: "basic",
  },
  XERO: {
    authUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scope: "offline_access accounting.contacts.read accounting.transactions.read",
    clientIdEnv: "XERO_CLIENT_ID",
    clientSecretEnv: "XERO_CLIENT_SECRET",
    tokenAuth: "basic",
  },
};

export function providerConfigured(provider: AccountingProvider): boolean {
  const cfg = CONFIGS[provider];
  return Boolean(process.env[cfg.clientIdEnv] && process.env[cfg.clientSecretEnv]);
}

export function redirectUri(origin: string, slug: ProviderSlug): string {
  return `${process.env.APP_URL ?? origin}/api/integrations/${slug}/callback`;
}

export function authorizeUrl(
  provider: AccountingProvider,
  slug: ProviderSlug,
  origin: string,
  state: string
): string {
  const cfg = CONFIGS[provider];
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env[cfg.clientIdEnv]!,
    redirect_uri: redirectUri(origin, slug),
    scope: cfg.scope,
    state,
    ...cfg.authExtras,
  });
  return `${cfg.authUrl}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(
  provider: AccountingProvider,
  form: Record<string, string>
): Promise<TokenResponse> {
  const cfg = CONFIGS[provider];
  const clientId = process.env[cfg.clientIdEnv]!;
  const clientSecret = process.env[cfg.clientSecretEnv]!;

  const body = new URLSearchParams(form);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (cfg.tokenAuth === "basic") {
    headers.Authorization =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body });
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(
  provider: AccountingProvider,
  slug: ProviderSlug,
  origin: string,
  code: string
): Promise<TokenResponse> {
  return tokenRequest(provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin, slug),
  });
}

/** Post-connect tenant discovery (Xero connections / Zoho organizations). */
export async function discoverOrgId(
  provider: AccountingProvider,
  accessToken: string
): Promise<string | null> {
  try {
    if (provider === "XERO") {
      const res = await fetch("https://api.xero.com/connections", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const conns = (await res.json()) as { tenantId?: string }[];
      return conns?.[0]?.tenantId ?? null;
    }
    if (provider === "ZOHO_BOOKS") {
      const res = await fetch(`${ZOHO_API_BASE}/books/v3/organizations`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      const data = (await res.json()) as {
        organizations?: { organization_id: string }[];
      };
      return data.organizations?.[0]?.organization_id ?? null;
    }
  } catch {
    return null;
  }
  return null; // QuickBooks realmId arrives on the callback URL instead
}

export async function saveConnection(params: {
  provider: AccountingProvider;
  tokens: TokenResponse;
  externalOrgId: string | null;
}): Promise<void> {
  const { provider, tokens, externalOrgId } = params;
  if (!tokens.refresh_token) {
    throw new Error("Provider did not return a refresh token");
  }
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + (tokens.expires_in - 60) * 1000)
    : null;

  await db.accountingConnection.upsert({
    where: { provider },
    create: {
      provider,
      refreshToken: encryptSecret(tokens.refresh_token),
      accessToken: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: expiresAt,
      externalOrgId,
    },
    update: {
      refreshToken: encryptSecret(tokens.refresh_token),
      accessToken: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: expiresAt,
      ...(externalOrgId ? { externalOrgId } : {}),
    },
  });
}

/** Valid access token for API calls, refreshing (and re-storing) if stale. */
export async function getAccessToken(
  provider: AccountingProvider
): Promise<{ token: string; orgId: string | null } | { error: string }> {
  const conn = await db.accountingConnection.findUnique({ where: { provider } });
  if (!conn) return { error: `${PROVIDER_LABELS[provider]} is not connected.` };

  const fresh =
    conn.accessToken &&
    conn.accessTokenExpiresAt &&
    conn.accessTokenExpiresAt > new Date();
  if (fresh) {
    return { token: decryptSecret(conn.accessToken!), orgId: conn.externalOrgId };
  }

  const tokens = await tokenRequest(provider, {
    grant_type: "refresh_token",
    refresh_token: decryptSecret(conn.refreshToken),
  });
  if (!tokens.access_token) {
    return {
      error: `${PROVIDER_LABELS[provider]} token refresh failed: ${
        tokens.error_description ?? tokens.error ?? "unknown error"
      } — reconnect from the Import page.`,
    };
  }

  await db.accountingConnection.update({
    where: { provider },
    data: {
      accessToken: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + (tokens.expires_in - 60) * 1000)
        : null,
      // Some providers rotate the refresh token on every refresh.
      ...(tokens.refresh_token
        ? { refreshToken: encryptSecret(tokens.refresh_token) }
        : {}),
    },
  });

  return { token: tokens.access_token, orgId: conn.externalOrgId };
}
