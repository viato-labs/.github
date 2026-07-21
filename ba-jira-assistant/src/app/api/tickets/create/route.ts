import { NextResponse } from "next/server";
import {
  createIssueFromDraft,
  createIssuesFromDrafts,
  getJiraConfigForCompany,
} from "@/lib/jira/client";
import { draftFromBriefForCompany } from "@/lib/playbooks/run";
import type { PlaybookId, TicketDraft } from "@/lib/types";
import { getCompany, rememberCreatedTicket } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    draft?: TicketDraft;
    drafts?: TicketDraft[];
    files?: string[];
    companyId?: string;
    playbookId?: PlaybookId;
    minConfidence?: number;
  };

  const company = await getCompany(
    body.companyId || body.draft?.companyId || body.drafts?.[0]?.companyId,
  );
  const config = await getJiraConfigForCompany(company.id);
  const minConfidence = body.minConfidence ?? 0;

  try {
    if (body.drafts?.length) {
      const filtered = body.drafts.filter((d) => d.confidence >= minConfidence);
      const results = await createIssuesFromDrafts(filtered, config);
      for (const [index, result] of results.entries()) {
        if (result.key) {
          await rememberCreatedTicket(company.id, {
            key: result.key,
            summary: filtered[index].summary,
            dryRun: result.dryRun,
            playbookId: filtered[index].playbookId,
          });
        }
      }
      return NextResponse.json({
        company: { id: company.id, name: company.name },
        results,
        skippedForConfidence: body.drafts.length - filtered.length,
      });
    }

    const draft =
      body.draft ||
      (body.message
        ? draftFromBriefForCompany(
            company,
            body.message,
            body.files,
            body.playbookId || "single-brief",
          )
        : null);

    if (!draft) {
      return NextResponse.json(
        { error: "Provide message, draft, or drafts to create" },
        { status: 400 },
      );
    }

    if (draft.confidence < minConfidence) {
      return NextResponse.json(
        {
          error: `Draft confidence ${draft.confidence} below minimum ${minConfidence}`,
          draft,
        },
        { status: 422 },
      );
    }

    const result = await createIssueFromDraft(draft, config);
    if (result.key) {
      await rememberCreatedTicket(company.id, {
        key: result.key,
        summary: draft.summary,
        dryRun: result.dryRun,
        playbookId: draft.playbookId,
      });
    }
    return NextResponse.json({
      company: { id: company.id, name: company.name },
      result,
      draft,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create issue",
      },
      { status: 502 },
    );
  }
}
