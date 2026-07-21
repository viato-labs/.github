import { NextResponse } from "next/server";
import { loadMemory, rememberCreatedTicket } from "@/lib/context-store";
import { buildTicketDraft } from "@/lib/intake";
import { createIssueFromDraft } from "@/lib/jira/client";
import type { TicketDraft } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    draft?: TicketDraft;
    files?: string[];
  };

  const memory = await loadMemory();
  const draft =
    body.draft ||
    (body.message
      ? buildTicketDraft(body.message, memory, { files: body.files })
      : null);

  if (!draft) {
    return NextResponse.json(
      { error: "Provide message or draft to create" },
      { status: 400 },
    );
  }

  try {
    const result = await createIssueFromDraft(draft);
    if (result.key) {
      await rememberCreatedTicket({
        key: result.key,
        summary: draft.summary,
        dryRun: result.dryRun,
      });
    }
    return NextResponse.json({ result, draft });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create issue",
      },
      { status: 502 },
    );
  }
}
