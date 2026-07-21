import { NextResponse } from "next/server";
import { getJiraConfigForCompany, probeJira } from "@/lib/jira/client";
import { getCompany } from "@/lib/workspaces/store";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") || undefined;
  const company = await getCompany(companyId);
  const config = await getJiraConfigForCompany(company.id);
  const status = await probeJira(config, company.name);
  return NextResponse.json({
    ...status,
    companyId: company.id,
    companyName: company.name,
    baseUrlConfigured: Boolean(config.baseUrl),
    emailConfigured: Boolean(config.email),
    tokenConfigured: Boolean(config.apiToken),
  });
}
