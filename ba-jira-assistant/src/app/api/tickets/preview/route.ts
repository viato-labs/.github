import { NextResponse } from "next/server";
import { draftFromBriefForCompany } from "@/lib/playbooks/run";
import { draftToMarkdown } from "@/lib/templates/ticket-body";
import type { PlaybookId, TicketDraft } from "@/lib/types";
import { getCompany } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    draft?: TicketDraft;
    files?: string[];
    companyId?: string;
    playbookId?: PlaybookId;
  };

  const company = await getCompany(body.companyId || body.draft?.companyId);
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
      { error: "Provide message or draft to preview" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    company: { id: company.id, name: company.name },
    draft,
    markdown: draftToMarkdown(draft),
  });
}
