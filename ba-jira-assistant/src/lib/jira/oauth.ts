import { createHash, randomBytes } from "crypto";
import type { AtlassianOAuthTokens } from "@/lib/types";

const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

export const ATLASSIAN_SCOPES = [
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "offline_access",
].join(" ");

export type OAuthAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getOAuthAppConfig(): OAuthAppConfig | null {
  const clientId = process.env.ATLASSIAN_CLIENT_ID || "";
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET || "";
  const redirectUri =
    process.env.ATLASSIAN_REDIRECT_URI ||
    "http://localhost:3000/api/auth/atlassian/callback";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function oauthConfigured(): boolean {
  return Boolean(getOAuthAppConfig());
}

export function buildAuthorizeUrl(input: {
  companyId: string;
  state: string;
}): string {
  const config = getOAuthAppConfig();
  if (!config) {
    throw new Error(
      "Atlassian OAuth is not configured. Set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET.",
    );
  }

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: config.clientId,
    scope: ATLASSIAN_SCOPES,
    redirect_uri: config.redirectUri,
    state: input.state,
    response_type: "code",
    prompt: "consent",
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function createOAuthState(companyId: string): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(16).toString("hex");
  const payload = Buffer.from(
    JSON.stringify({ companyId, nonce, ts: Date.now() }),
  ).toString("base64url");
  return { state: payload, nonce };
}

export function parseOAuthState(state: string): {
  companyId: string;
  nonce: string;
  ts: number;
} {
  const parsed = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8"),
  ) as { companyId?: string; nonce?: string; ts?: number };
  if (!parsed.companyId || !parsed.nonce) {
    throw new Error("Invalid OAuth state");
  }
  return {
    companyId: parsed.companyId,
    nonce: parsed.nonce,
    ts: parsed.ts || 0,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}> {
  const config = getOAuthAppConfig();
  if (!config) throw new Error("OAuth app is not configured");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${await response.text()}`);
  }
  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}> {
  const config = getOAuthAppConfig();
  if (!config) throw new Error("OAuth app is not configured");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${await response.text()}`);
  }
  return response.json();
}

export type AccessibleResource = {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
};

export async function listAccessibleResources(
  accessToken: string,
): Promise<AccessibleResource[]> {
  const response = await fetch(RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`accessible-resources failed: ${await response.text()}`);
  }
  return response.json();
}

export async function fetchOAuthIdentity(accessToken: string, cloudId: string) {
  const response = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`myself failed: ${await response.text()}`);
  }
  return response.json() as Promise<{
    displayName?: string;
    emailAddress?: string;
    accountId?: string;
  }>;
}

export function toStoredTokens(input: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
  cloudId: string;
  siteUrl: string;
  siteName: string;
  accountEmail?: string;
  accountDisplayName?: string;
  previous?: AtlassianOAuthTokens | null;
}): AtlassianOAuthTokens {
  return {
    accessToken: input.accessToken,
    // Atlassian rotates refresh tokens — keep previous if omitted.
    refreshToken: input.refreshToken || input.previous?.refreshToken || "",
    expiresAt: Date.now() + input.expiresIn * 1000,
    scope: input.scope || input.previous?.scope || ATLASSIAN_SCOPES,
    cloudId: input.cloudId,
    siteUrl: input.siteUrl,
    siteName: input.siteName,
    accountEmail: input.accountEmail || input.previous?.accountEmail,
    accountDisplayName:
      input.accountDisplayName || input.previous?.accountDisplayName,
    updatedAt: new Date().toISOString(),
  };
}

export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}
