import { NextResponse } from "next/server";
import { getJiraConfigForCompany, probeJira } from "@/lib/jira/client";
import { oauthConfigured } from "@/lib/jira/oauth";
import { getCompany } from "@/lib/workspaces/store";

export async function GET(request: Request) {
  const companyId =
    new URL(request.url).searchParams.get("companyId") || undefined;
  const company = await getCompany(companyId);
  const config = await getJiraConfigForCompany(company.id);
  const probe = await probeJira(config, company.name);

  return NextResponse.json({
    oauthAppConfigured: oauthConfigured(),
    companyId: company.id,
    companyName: company.name,
    connection: company.connection,
    ...probe,
  });
}
