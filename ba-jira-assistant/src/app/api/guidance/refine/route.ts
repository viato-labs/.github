import { NextResponse } from "next/server";
import {
  previewsFromDrafts,
  refineDraftsWithChat,
} from "@/lib/guidance/refine";
import type { TicketDraft } from "@/lib/types";
import { getCompany, rememberBrief } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    message?: string;
    drafts?: TicketDraft[];
    /** 0-based ticket index; omit for all / auto-detect from message */
    targetIndex?: number | null;
  };

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (!body.drafts?.length) {
    return NextResponse.json(
      { error: "drafts are required — research & draft first" },
      { status: 400 },
    );
  }

  const company = await getCompany(body.companyId || body.drafts[0]?.companyId);
  await rememberBrief(company.id, `Refine: ${message}`);

  const result = refineDraftsWithChat({
    drafts: body.drafts,
    message,
    targetIndex: body.targetIndex,
  });

  return NextResponse.json({
    company: { id: company.id, name: company.name, slug: company.slug },
    reply: result.reply,
    target: result.target,
    drafts: result.drafts,
    previews: previewsFromDrafts(result.drafts),
  });
}
