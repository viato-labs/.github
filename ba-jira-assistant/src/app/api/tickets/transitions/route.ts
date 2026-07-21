import { NextResponse } from "next/server";
import {
  getJiraConfigForCompany,
  listIssueTransitions,
  transitionIssueToStatus,
} from "@/lib/jira/client";
import { getCompany } from "@/lib/workspaces/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const issueKey = url.searchParams.get("issueKey");
  const companyId = url.searchParams.get("companyId") || undefined;

  if (!issueKey) {
    return NextResponse.json({ error: "issueKey is required" }, { status: 400 });
  }

  try {
    const company = await getCompany(companyId);
    const config = await getJiraConfigForCompany(company.id);
    const listed = await listIssueTransitions(issueKey, config, company.id);
    return NextResponse.json({
      company: { id: company.id, name: company.name },
      workflow: company.workflow,
      ...listed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not list transitions",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    issueKey?: string;
    targetStatus?: string;
    transitionId?: string;
    confirm?: boolean;
  };

  if (!body.issueKey || (!body.targetStatus && !body.transitionId)) {
    return NextResponse.json(
      { error: "issueKey and targetStatus (or transitionId) are required" },
      { status: 400 },
    );
  }

  try {
    const company = await getCompany(body.companyId);
    const config = await getJiraConfigForCompany(company.id);

    if (body.transitionId && body.confirm) {
      // Direct transition by id after user picked an exact available transition.
      await (
        await import("@/lib/jira/client")
      ).jiraRequest(config, `/rest/api/3/issue/${body.issueKey}/transitions`, {
        method: "POST",
        body: JSON.stringify({ transition: { id: body.transitionId } }),
      });
      const listed = await listIssueTransitions(body.issueKey, config, company.id);
      return NextResponse.json({
        company: { id: company.id, name: company.name },
        result: {
          key: body.issueKey,
          dryRun: false,
          toStatus: listed.currentStatus || body.targetStatus || "updated",
          transitionId: body.transitionId,
          availableTransitions: listed.transitions,
          message: `Applied transition ${body.transitionId} on ${body.issueKey}. Current status: ${listed.currentStatus || "unknown"}.`,
        },
      });
    }

    const result = await transitionIssueToStatus({
      issueKey: body.issueKey,
      targetStatus:
        body.targetStatus || company.workflow.defaultPostCreateStatus || "In Analysis",
      companyId: company.id,
      config,
      confirm: Boolean(body.confirm),
    });

    return NextResponse.json({
      company: { id: company.id, name: company.name },
      workflow: company.workflow,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Transition failed",
      },
      { status: 502 },
    );
  }
}
