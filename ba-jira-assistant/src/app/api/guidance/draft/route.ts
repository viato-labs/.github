import { NextResponse } from "next/server";
import {
  draftsFromGuidance,
  type TicketAudience,
} from "@/lib/guidance/draft";
import { draftToMarkdown } from "@/lib/templates/ticket-body";
import { researchCompanyContext } from "@/lib/research/context";
import { getJiraConfigForCompany } from "@/lib/jira/client";
import { getCompany, rememberBrief } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    guidance?: string;
    links?: string[];
    files?: string[];
    audience?: TicketAudience;
    research?: boolean;
  };

  const guidance = body.guidance?.trim();
  if (!guidance) {
    return NextResponse.json({ error: "guidance is required" }, { status: 400 });
  }

  const company = await getCompany(body.companyId);
  const audience = body.audience || "both";
  const files = body.files || [];
  const links = body.links || [];

  await rememberBrief(
    company.id,
    [guidance, ...links.map((l) => `Link: ${l}`)].join("\n"),
    files,
  );

  let research = null;
  if (body.research !== false) {
    const config = await getJiraConfigForCompany(company.id);
    if (config.mode === "oauth" || config.mode === "basic") {
      research = await researchCompanyContext(company.id, guidance);
    }
  }

  const drafts = draftsFromGuidance({
    guidance,
    links,
    files,
    audience,
    company: await getCompany(company.id),
    research,
  });

  return NextResponse.json({
    company: { id: company.id, name: company.name, slug: company.slug },
    audience,
    research,
    drafts,
    previews: drafts.map((draft) => ({
      summary: draft.summary,
      projectKey: draft.projectKey,
      intent: draft.intent,
      confidence: draft.confidence,
      markdown: draftToMarkdown(draft),
      draft,
    })),
  });
}
