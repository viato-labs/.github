import { pickField } from "@/lib/bulk/parse-tabular";
import { buildTicketDraft } from "@/lib/intake";
import type {
  BulkDraftResult,
  CompanyWorkspace,
  Playbook,
  PlaybookId,
  TicketDraft,
} from "@/lib/types";

function findPlaybook(company: CompanyWorkspace, playbookId: PlaybookId): Playbook {
  const playbook = company.playbooks.find((p) => p.id === playbookId);
  if (!playbook) {
    throw new Error(`Playbook ${playbookId} is not enabled for ${company.name}`);
  }
  return playbook;
}

function rowToBrief(
  company: CompanyWorkspace,
  playbook: Playbook,
  row: Record<string, string>,
  extras?: { forcedSection?: string },
): string {
  const title =
    pickField(row, playbook.rowTitleFields) ||
    extras?.forcedSection ||
    "Untitled row";
  const bodyBits = playbook.rowBodyFields
    .map((field) => {
      const value = pickField(row, [field]);
      return value ? `${field}: ${value}` : "";
    })
    .filter(Boolean);

  const leftover = Object.entries(row)
    .filter(([key, value]) => {
      if (!value) return false;
      const used = [...playbook.rowTitleFields, ...playbook.rowBodyFields].some(
        (candidate) => key.includes(candidate.toLowerCase()),
      );
      return !used;
    })
    .map(([key, value]) => `${key}: ${value}`);

  const epicLine =
    playbook.id === "field-trip-by-engagement"
      ? "Epic: BAU"
      : playbook.id === "configurator-design-sections"
        ? "Epic: Configurator"
        : "";

  const titleLine =
    playbook.id === "field-trip-by-engagement"
      ? `Title: [SCO] ${title}`
      : `Title: ${title}`;

  const lines = [
    titleLine,
    `Intent hint: ${playbook.defaultIntent}`,
    `Company: ${company.name}`,
    epicLine,
    playbook.id === "field-trip-by-engagement"
      ? "Labels: sco, engagement, bau"
      : "",
    bodyBits.length ? `Details:\n${bodyBits.join("\n")}` : "",
    leftover.length ? `Additional columns:\n${leftover.join("\n")}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function withPlaybookMeta(
  draft: TicketDraft,
  playbookId: PlaybookId,
  row?: Record<string, string>,
): TicketDraft {
  return {
    ...draft,
    playbookId,
    sourceRow: row,
    confidence: Math.max(draft.confidence, row ? 0.72 : draft.confidence),
  };
}

export function draftFromBriefForCompany(
  company: CompanyWorkspace,
  message: string,
  files: string[] = [],
  playbookId: PlaybookId = "single-brief",
): TicketDraft {
  const draft = buildTicketDraft(message, company, { files, playbookId });
  return withPlaybookMeta(draft, playbookId);
}

export function runBulkPlaybook(
  company: CompanyWorkspace,
  playbookId: PlaybookId,
  rows: Array<Record<string, string>>,
): BulkDraftResult {
  const playbook = findPlaybook(company, playbookId);
  const drafts: TicketDraft[] = [];
  const skippedRows: BulkDraftResult["skippedRows"] = [];

  if (playbookId === "configurator-design-sections" && rows.length === 0) {
    // Knowledge-only mode: one design ticket per remembered section.
    for (const section of company.memory.sections) {
      const synthetic = {
        section,
        title: `[Design] ${section} configurator section`,
        notes: `Design the ${section} section using existing McLaren configurator patterns and prior design tickets.`,
      };
      const brief = rowToBrief(company, playbook, synthetic, {
        forcedSection: section,
      });
      const draft = withPlaybookMeta(
        buildTicketDraft(brief, company, {
          playbookId,
          forcedIntent: "design",
        }),
        playbookId,
        synthetic,
      );
      drafts.push(draft);
    }
    return { companyId: company.id, playbookId, drafts, skippedRows };
  }

  rows.forEach((row, index) => {
    const title = pickField(row, playbook.rowTitleFields);
    if (!title) {
      skippedRows.push({
        rowNumber: index + 2,
        reason: "No title/summary/engagement field found",
      });
      return;
    }
    const brief = rowToBrief(company, playbook, row);
    const draft = withPlaybookMeta(
      buildTicketDraft(brief, company, {
        playbookId,
        forcedIntent: playbook.defaultIntent,
      }),
      playbookId,
      row,
    );
    drafts.push(draft);
  });

  return { companyId: company.id, playbookId, drafts, skippedRows };
}
