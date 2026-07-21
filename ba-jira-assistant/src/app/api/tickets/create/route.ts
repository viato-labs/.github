import { NextResponse } from "next/server";
import {
  createIssueFromDraft,
  createIssuesFromDrafts,
  getJiraConfigForCompany,
  transitionIssueToStatus,
} from "@/lib/jira/client";
import { draftFromBriefForCompany } from "@/lib/playbooks/run";
import type { PlaybookId, TicketDraft, TransitionResult } from "@/lib/types";
import { getCompany, rememberCreatedTicket } from "@/lib/workspaces/store";

async function maybeTransitionCreated(input: {
  companyId: string;
  issueKey?: string;
  dryRun: boolean;
  transitionToStatus?: string | null;
  enableDefault: boolean;
  defaultStatus?: string;
}) {
  const target =
    input.transitionToStatus === null
      ? undefined
      : input.transitionToStatus ||
        (input.enableDefault ? input.defaultStatus : undefined);

  if (!input.issueKey || !target || input.dryRun) return undefined;

  return transitionIssueToStatus({
    issueKey: input.issueKey,
    targetStatus: target,
    companyId: input.companyId,
    confirm: true,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    draft?: TicketDraft;
    drafts?: TicketDraft[];
    files?: string[];
    companyId?: string;
    playbookId?: PlaybookId;
    minConfidence?: number;
    /** Set status after create, e.g. "In Analysis". null disables. */
    transitionToStatus?: string | null;
  };

  const company = await getCompany(
    body.companyId || body.draft?.companyId || body.drafts?.[0]?.companyId,
  );
  const config = await getJiraConfigForCompany(company.id);
  const minConfidence = body.minConfidence ?? 0;
  const workflow = company.workflow;

  try {
    if (body.drafts?.length) {
      const filtered = body.drafts.filter((d) => d.confidence >= minConfidence);
      const results = await createIssuesFromDrafts(filtered, config);
      const withTransitions = [];
      for (const [index, result] of results.entries()) {
        if (result.key) {
          await rememberCreatedTicket(company.id, {
            key: result.key,
            summary: filtered[index].summary,
            dryRun: result.dryRun,
            playbookId: filtered[index].playbookId,
          });
        }
        let transition: TransitionResult | undefined;
        try {
          transition = await maybeTransitionCreated({
            companyId: company.id,
            issueKey: result.key,
            dryRun: result.dryRun,
            transitionToStatus: body.transitionToStatus,
            enableDefault: workflow.enablePostCreateTransition,
            defaultStatus: workflow.defaultPostCreateStatus,
          });
        } catch (error) {
          transition = {
            key: result.key || "unknown",
            dryRun: true,
            toStatus: body.transitionToStatus || workflow.defaultPostCreateStatus || "",
            availableTransitions: [],
            message:
              error instanceof Error
                ? error.message
                : "Post-create transition failed",
          };
        }
        withTransitions.push({ ...result, transition });
      }
      return NextResponse.json({
        company: { id: company.id, name: company.name },
        workflow,
        results: withTransitions,
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

    let transition: TransitionResult | undefined;
    try {
      transition = await maybeTransitionCreated({
        companyId: company.id,
        issueKey: result.key,
        dryRun: result.dryRun,
        transitionToStatus: body.transitionToStatus,
        enableDefault: workflow.enablePostCreateTransition,
        defaultStatus: workflow.defaultPostCreateStatus,
      });
    } catch (error) {
      transition = {
        key: result.key || "unknown",
        dryRun: true,
        toStatus: body.transitionToStatus || workflow.defaultPostCreateStatus || "",
        availableTransitions: [],
        message:
          error instanceof Error ? error.message : "Post-create transition failed",
      };
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name },
      workflow,
      result: { ...result, transition },
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
