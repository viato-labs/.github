import { NextResponse } from "next/server";
import { replaceDefinitionOfReady } from "@/lib/context-store";
import { getJiraConfig, harvestDorFromIssue } from "@/lib/jira/client";

export async function POST(request: Request) {
  const body = (await request.json()) as { issueKey?: string };
  const issueKey = body.issueKey || process.env.JIRA_GOLDEN_TICKET_KEY;

  if (!issueKey) {
    return NextResponse.json(
      { error: "issueKey is required (or set JIRA_GOLDEN_TICKET_KEY)" },
      { status: 400 },
    );
  }

  try {
    const config = getJiraConfig();
    const harvested = await harvestDorFromIssue(issueKey, config);
    if (harvested.rows.length) {
      await replaceDefinitionOfReady(harvested.rows);
    }
    return NextResponse.json(harvested);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Harvest failed",
      },
      { status: 502 },
    );
  }
}
