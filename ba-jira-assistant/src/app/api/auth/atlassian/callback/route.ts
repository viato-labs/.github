import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchOAuthIdentity,
  hashNonce,
  listAccessibleResources,
  parseOAuthState,
  toStoredTokens,
} from "@/lib/jira/oauth";
import {
  consumeOAuthNonce,
  getCompany,
  saveCompanyOAuth,
  setActiveCompany,
} from "@/lib/workspaces/store";

function appOrigin(request: Request): string {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const origin = appOrigin(request);

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&message=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&message=${encodeURIComponent("Missing OAuth code/state")}`,
    );
  }

  try {
    const parsed = parseOAuthState(state);
    const expectedCompanyId = await consumeOAuthNonce(hashNonce(parsed.nonce));
    if (!expectedCompanyId || expectedCompanyId !== parsed.companyId) {
      throw new Error("OAuth state/nonce mismatch or expired. Try signing in again.");
    }

    const company = await getCompany(parsed.companyId);
    const tokenResponse = await exchangeCodeForTokens(code);
    const resources = await listAccessibleResources(tokenResponse.access_token);
    if (!resources.length) {
      throw new Error(
        "No Jira sites available for this Microsoft/Atlassian account.",
      );
    }

    const namedMatch = (resource: (typeof resources)[number]) =>
      `${resource.name} ${resource.url}`
        .toLowerCase()
        .includes(company.name.toLowerCase().split(/\s+/)[0] || "");

    const jiraResource =
      resources.find(
        (resource) =>
          namedMatch(resource) &&
          resource.scopes.some((scope) => scope.includes("jira")),
      ) ||
      resources.find((resource) =>
        resource.scopes.some((scope) => scope.includes("jira")),
      ) ||
      resources[0];

    const confluenceResource =
      resources.find(
        (resource) =>
          namedMatch(resource) &&
          resource.scopes.some((scope) => scope.includes("confluence")),
      ) ||
      resources.find((resource) =>
        resource.scopes.some((scope) => scope.includes("confluence")),
      );

    const identity = await fetchOAuthIdentity(
      tokenResponse.access_token,
      jiraResource.id,
    );

    const tokens = toStoredTokens({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      scope: tokenResponse.scope,
      cloudId: jiraResource.id,
      confluenceCloudId: confluenceResource?.id || jiraResource.id,
      siteUrl: jiraResource.url,
      siteName: jiraResource.name,
      accountEmail: identity.emailAddress,
      accountDisplayName: identity.displayName,
    });

    if (!tokens.refreshToken) {
      throw new Error(
        "No refresh token returned. Ensure offline_access scope is enabled on the Atlassian OAuth app.",
      );
    }

    await saveCompanyOAuth(company.id, tokens);
    await setActiveCompany(company.id);

    return NextResponse.redirect(
      `${origin}/?oauth=success&companyId=${encodeURIComponent(company.id)}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OAuth callback failed";
    return NextResponse.redirect(
      `${origin}/?oauth=error&message=${encodeURIComponent(message)}`,
    );
  }
}
