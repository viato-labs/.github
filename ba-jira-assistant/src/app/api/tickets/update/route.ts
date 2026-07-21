import { NextResponse } from "next/server";
import {
  getJiraConfigForCompany,
  updateIssueFromDraft,
} from "@/lib/jira/client";
import type { TicketDraft } from "@/lib/types";
import { getCompany } from "@/lib/workspaces/store";

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    issueKey?: string;
    draft?: TicketDraft;
    companyId?: string;
  };

  if (!body.issueKey || !body.draft) {
    return NextResponse.json(
      { error: "issueKey and draft are required" },
      { status: 400 },
    );
  }

  try {
    const company = await getCompany(body.companyId || body.draft.companyId);
    const config = await getJiraConfigForCompany(company.id);
    const result = await updateIssueFromDraft(body.issueKey, body.draft, config);
    return NextResponse.json({
      company: { id: company.id, name: company.name },
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Update failed",
      },
      { status: 502 },
    );
  }
}
