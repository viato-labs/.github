import { NextResponse } from "next/server";
import { getJiraConfig, probeJira } from "@/lib/jira/client";

export async function GET() {
  const config = getJiraConfig();
  const status = await probeJira(config);
  return NextResponse.json({
    ...status,
    baseUrlConfigured: Boolean(config.baseUrl),
    emailConfigured: Boolean(config.email),
    tokenConfigured: Boolean(config.apiToken),
  });
}
