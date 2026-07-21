import { NextResponse } from "next/server";
import { parseCsv, parseSpreadsheetBuffer } from "@/lib/bulk/parse-tabular";
import {
  createIssuesFromDrafts,
  getJiraConfigForCompany,
} from "@/lib/jira/client";
import { runBulkPlaybook } from "@/lib/playbooks/run";
import { draftToMarkdown } from "@/lib/templates/ticket-body";
import type { PlaybookId } from "@/lib/types";
import { getCompany, rememberCreatedTicket } from "@/lib/workspaces/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    playbookId?: PlaybookId;
    csvText?: string;
    fileBase64?: string;
    fileName?: string;
    create?: boolean;
    useKnowledgeSections?: boolean;
    minConfidence?: number;
  };

  const company = await getCompany(body.companyId);
  const playbookId = body.playbookId || "bulk-rows";

  try {
    let rows: Array<Record<string, string>> = [];
    let sheetName = "knowledge";

    if (body.fileBase64) {
      const buffer = Buffer.from(body.fileBase64, "base64");
      const parsed = parseSpreadsheetBuffer(buffer, body.fileName);
      rows = parsed.rows;
      sheetName = parsed.sheetName;
    } else if (body.csvText) {
      const parsed = parseCsv(body.csvText);
      rows = parsed.rows;
      sheetName = parsed.sheetName;
    } else if (
      !(body.useKnowledgeSections || playbookId === "configurator-design-sections")
    ) {
      return NextResponse.json(
        {
          error:
            "Provide csvText, fileBase64, or useKnowledgeSections for configurator design sections",
        },
        { status: 400 },
      );
    }

    const bulk = runBulkPlaybook(company, playbookId, rows);
    const previews = bulk.drafts.map((draft) => ({
      summary: draft.summary,
      projectKey: draft.projectKey,
      confidence: draft.confidence,
      markdown: draftToMarkdown(draft),
      draft,
    }));

    if (!body.create) {
      return NextResponse.json({
        company: { id: company.id, name: company.name },
        playbookId,
        sheetName,
        rowCount: rows.length,
        draftCount: bulk.drafts.length,
        skippedRows: bulk.skippedRows,
        previews,
      });
    }

    const minConfidence = body.minConfidence ?? 0;
    const ready = bulk.drafts.filter((d) => d.confidence >= minConfidence);
    const config = await getJiraConfigForCompany(company.id);
    const results = await createIssuesFromDrafts(ready, config);

    for (const [index, result] of results.entries()) {
      if (result.key) {
        await rememberCreatedTicket(company.id, {
          key: result.key,
          summary: ready[index].summary,
          dryRun: result.dryRun,
          playbookId,
        });
      }
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name },
      playbookId,
      sheetName,
      draftCount: bulk.drafts.length,
      createdCount: results.length,
      skippedRows: bulk.skippedRows,
      skippedForConfidence: bulk.drafts.length - ready.length,
      results,
      previews,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Bulk draft failed",
      },
      { status: 400 },
    );
  }
}
