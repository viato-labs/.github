import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  createOAuthState,
  hashNonce,
  oauthConfigured,
} from "@/lib/jira/oauth";
import { getCompany, saveOAuthNonce } from "@/lib/workspaces/store";

export async function GET(request: Request) {
  if (!oauthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Atlassian OAuth app is not configured. Set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET in .env.local.",
      },
      { status: 503 },
    );
  }

  const companyId =
    new URL(request.url).searchParams.get("companyId") || undefined;

  try {
    const company = await getCompany(companyId);
    const { state, nonce } = createOAuthState(company.id);
    await saveOAuthNonce(hashNonce(nonce), company.id);
    const url = buildAuthorizeUrl({ companyId: company.id, state });
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not start OAuth",
      },
      { status: 400 },
    );
  }
}
