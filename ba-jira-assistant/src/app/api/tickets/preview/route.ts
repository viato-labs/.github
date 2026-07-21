import { NextResponse } from "next/server";
import { loadMemory } from "@/lib/context-store";
import { buildTicketDraft } from "@/lib/intake";
import { draftToMarkdown } from "@/lib/templates/ticket-body";
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
      { error: "Provide message or draft to preview" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    draft,
    markdown: draftToMarkdown(draft),
  });
}
