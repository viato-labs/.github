import { NextResponse } from "next/server";
import { getJiraConfigForCompany, probeJira } from "@/lib/jira/client";
import { oauthConfigured } from "@/lib/jira/oauth";
import { getCompany } from "@/lib/workspaces/store";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") || undefined;
  const company = await getCompany(companyId);
  const config = await getJiraConfigForCompany(company.id);
  const status = await probeJira(config, company.name);
  return NextResponse.json({
    ...status,
    oauthAppConfigured: oauthConfigured(),
    companyId: company.id,
    companyName: company.name,
    connection: company.connection,
    baseUrlConfigured: Boolean(config.baseUrl),
    emailConfigured: Boolean(config.email || config.accountLabel),
    tokenConfigured: config.mode === "basic",
    oauthConnected: config.mode === "oauth",
  });
}
