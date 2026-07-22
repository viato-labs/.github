import { NextResponse } from "next/server";
import { buildAssistantReply } from "@/lib/intake";
import { draftFromBriefForCompany } from "@/lib/playbooks/run";
import {
  enrichDraftWithResearch,
  researchCompanyContext,
} from "@/lib/research/context";
import type { PlaybookId } from "@/lib/types";
import { getCompany, rememberBrief } from "@/lib/workspaces/store";
import { getJiraConfigForCompany } from "@/lib/jira/client";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    files?: string[];
    companyId?: string;
    playbookId?: PlaybookId;
    research?: boolean;
  };

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const company = await getCompany(body.companyId);
  const files = body.files || [];
  await rememberBrief(company.id, message, files);
  let refreshed = await getCompany(company.id);

  let draft = draftFromBriefForCompany(
    refreshed,
    message,
    files,
    body.playbookId || "single-brief",
  );

  let research = null;
  const shouldResearch = body.research !== false;
  if (shouldResearch) {
    const config = await getJiraConfigForCompany(company.id);
    if (config.mode === "oauth" || config.mode === "basic") {
      research = await researchCompanyContext(company.id, message);
      draft = enrichDraftWithResearch(draft, research);
      refreshed = await getCompany(company.id);
    }
  }

  const reply = buildAssistantReply(draft, refreshed);

  return NextResponse.json({
    reply,
    draft,
    research,
    company: {
      id: refreshed.id,
      name: refreshed.name,
      slug: refreshed.slug,
    },
    memorySummary: {
      epics: Object.keys(refreshed.memory.epicMap).length,
      briefs: refreshed.memory.briefs.length,
      glossaryTerms: Object.keys(refreshed.memory.productGlossary).length,
      dorRows: refreshed.memory.definitionOfReady.length,
      historicalTickets: refreshed.memory.historicalTickets.length,
      confluencePages: refreshed.memory.confluencePages?.length || 0,
      sections: refreshed.memory.sections.length,
    },
  });
}

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") || undefined;
  const company = await getCompany(companyId);
  return NextResponse.json({
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      boards: company.boards,
      playbooks: company.playbooks,
    },
    tips: [
      `Active company knowledge is isolated to ${company.name}.`,
      "After Microsoft sign-in, drafts search Jira + Confluence and grow historical memory.",
      "Upload Excel/CSV and choose a playbook for bulk ticket creation.",
    ],
    memorySummary: {
      epics: company.memory.epicMap,
      sections: company.memory.sections,
      historicalTickets: company.memory.historicalTickets.slice(0, 8),
      confluencePages: (company.memory.confluencePages || []).slice(0, 8),
      defaults: {
        project: company.memory.defaultProjectKey,
        issueType: company.memory.defaultIssueType,
      },
      recentBriefs: company.memory.briefs.slice(0, 5).map((b) => ({
        id: b.id,
        createdAt: b.createdAt,
        preview: b.text.slice(0, 140),
      })),
    },
  });
}
