import { NextResponse } from "next/server";
import { harvestDorFromIssue } from "@/lib/jira/client";
import { getCompany, replaceDefinitionOfReady } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    issueKey?: string;
    companyId?: string;
  };
  const company = await getCompany(body.companyId);
  const issueKey = body.issueKey || process.env.JIRA_GOLDEN_TICKET_KEY;

  if (!issueKey) {
    return NextResponse.json(
      { error: "issueKey is required (or set JIRA_GOLDEN_TICKET_KEY)" },
      { status: 400 },
    );
  }

  try {
    const harvested = await harvestDorFromIssue(issueKey, undefined, company.id);
    if (harvested.rows.length) {
      await replaceDefinitionOfReady(company.id, harvested.rows);
    }
    return NextResponse.json({
      company: { id: company.id, name: company.name },
      ...harvested,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Harvest failed",
      },
      { status: 502 },
    );
  }
}
