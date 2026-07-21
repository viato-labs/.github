import { NextResponse } from "next/server";
import { rememberBrief, loadMemory } from "@/lib/context-store";
import { buildAssistantReply, buildTicketDraft } from "@/lib/intake";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    files?: string[];
  };

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const files = body.files || [];
  const memory = await rememberBrief(message, files);
  const draft = buildTicketDraft(message, memory, { files });
  const reply = buildAssistantReply(draft);

  return NextResponse.json({
    reply,
    draft,
    memorySummary: {
      epics: Object.keys(memory.epicMap).length,
      briefs: memory.briefs.length,
      glossaryTerms: Object.keys(memory.productGlossary).length,
      dorRows: memory.definitionOfReady.length,
    },
  });
}

export async function GET() {
  const memory = await loadMemory();
  return NextResponse.json({
    tips: [
      "Paste a short BA brief — include epic, priority, and any AC thoughts if you have them.",
      "Commands: epic map like `Epic: Discovery`, `Project: WEB`, `Priority: High`.",
      "Upload notes as file text; they are stored in context memory for later consistency.",
    ],
    memorySummary: {
      epics: memory.epicMap,
      defaults: {
        project: memory.defaultProjectKey,
        issueType: memory.defaultIssueType,
      },
      recentBriefs: memory.briefs.slice(0, 5).map((b) => ({
        id: b.id,
        createdAt: b.createdAt,
        preview: b.text.slice(0, 140),
      })),
    },
  });
}
