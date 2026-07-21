import {
  searchConfluencePages,
  searchJiraIssues,
} from "@/lib/research/search";
import type {
  CompanyWorkspace,
  ConfluencePageRef,
  HistoricalTicketRef,
  ResearchBundle,
  TicketDraft,
} from "@/lib/types";
import {
  getCompany,
  saveCompanyMemory,
} from "@/lib/workspaces/store";

function nowIso() {
  return new Date().toISOString();
}

function localHistoricalMatches(
  company: CompanyWorkspace,
  query: string,
): HistoricalTicketRef[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3);
  return company.memory.historicalTickets
    .filter((ticket) => {
      const hay = `${ticket.summary} ${ticket.notes || ""} ${ticket.snippet || ""} ${ticket.section || ""}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    })
    .slice(0, 6);
}

function buildContextSummary(input: {
  query: string;
  companyName: string;
  jiraTitles: string[];
  confluenceTitles: string[];
  historicalTitles: string[];
}): string {
  const parts = [
    `New work for ${input.companyName}: "${input.query}".`,
    "This is a new ticket, but it should align with existing product behaviour and BA house style.",
  ];
  if (input.jiraTitles.length) {
    parts.push(
      `Related Jira history: ${input.jiraTitles.slice(0, 5).join("; ")}.`,
    );
  }
  if (input.confluenceTitles.length) {
    parts.push(
      `Related Confluence context: ${input.confluenceTitles.slice(0, 5).join("; ")}.`,
    );
  }
  if (input.historicalTitles.length) {
    parts.push(
      `Remembered style refs: ${input.historicalTitles.slice(0, 5).join("; ")}.`,
    );
  }
  if (
    !input.jiraTitles.length &&
    !input.confluenceTitles.length &&
    !input.historicalTitles.length
  ) {
    parts.push(
      "No strong live matches yet — draft from company house style and the brief alone.",
    );
  }
  return parts.join(" ");
}

export async function researchCompanyContext(
  companyId: string,
  query: string,
): Promise<ResearchBundle> {
  const company = await getCompany(companyId);
  const cleaned = query.trim();

  const [jiraHits, confluenceHits] = await Promise.all([
    searchJiraIssues(company.id, cleaned).catch(() => []),
    searchConfluencePages(company.id, cleaned).catch(() => []),
  ]);

  const relatedHistorical = localHistoricalMatches(company, cleaned);

  // Persist learned references into long-term company memory.
  const learnedTickets: HistoricalTicketRef[] = jiraHits.map((hit) => ({
    key: hit.id,
    summary: hit.title,
    snippet: hit.snippet,
    url: hit.url,
    notes: "Learned from Jira search while drafting",
    capturedAt: nowIso(),
    source: "jira-search",
  }));

  const learnedPages: ConfluencePageRef[] = confluenceHits.map((hit) => ({
    id: hit.id,
    title: hit.title,
    url: hit.url,
    snippet: hit.snippet,
    capturedAt: nowIso(),
    source: "confluence-search",
  }));

  const memory = company.memory;
  if (!memory.confluencePages) memory.confluencePages = [];
  if (!memory.researchQueries) memory.researchQueries = [];

  const ticketKeys = new Set(memory.historicalTickets.map((t) => t.key));
  for (const ticket of learnedTickets) {
    if (!ticketKeys.has(ticket.key)) {
      memory.historicalTickets.unshift(ticket);
      ticketKeys.add(ticket.key);
    }
  }
  memory.historicalTickets = memory.historicalTickets.slice(0, 300);

  const pageIds = new Set(memory.confluencePages.map((p) => p.id));
  for (const page of learnedPages) {
    if (!pageIds.has(page.id)) {
      memory.confluencePages.unshift(page);
      pageIds.add(page.id);
    }
  }
  memory.confluencePages = memory.confluencePages.slice(0, 300);

  memory.researchQueries.unshift({
    query: cleaned,
    searchedAt: nowIso(),
    jiraCount: jiraHits.length,
    confluenceCount: confluenceHits.length,
  });
  memory.researchQueries = memory.researchQueries.slice(0, 100);

  // Light style inference from repeated patterns in titles.
  if (jiraHits.length >= 3) {
    const note = `Recent Jira phrasing around "${cleaned.split(/\s+/).slice(0, 4).join(" ")}" should stay consistent with keys like ${jiraHits
      .slice(0, 3)
      .map((h) => h.id)
      .join(", ")}.`;
    if (!memory.houseStyleNotes.includes(note)) {
      memory.houseStyleNotes.unshift(note);
      memory.houseStyleNotes = memory.houseStyleNotes.slice(0, 40);
    }
  }

  await saveCompanyMemory(company.id, memory);

  const styleNotes = memory.houseStyleNotes.slice(0, 5);
  const contextSummary = buildContextSummary({
    query: cleaned,
    companyName: company.name,
    jiraTitles: jiraHits.map((h) => `${h.id}: ${h.title}`),
    confluenceTitles: confluenceHits.map((h) => h.title),
    historicalTitles: relatedHistorical.map((h) => `${h.key}: ${h.summary}`),
  });

  return {
    query: cleaned,
    companyId: company.id,
    searchedAt: nowIso(),
    jiraHits,
    confluenceHits,
    relatedHistorical,
    styleNotes,
    contextSummary,
  };
}

export function enrichDraftWithResearch(
  draft: TicketDraft,
  research: ResearchBundle,
): TicketDraft {
  const jiraLines = research.jiraHits
    .slice(0, 5)
    .map((hit) => `- ${hit.id}: ${hit.title} — ${hit.snippet}`);
  const confluenceLines = research.confluenceHits
    .slice(0, 5)
    .map((hit) => `- ${hit.title}: ${hit.snippet}`);
  const memoryLines = research.relatedHistorical
    .slice(0, 4)
    .map((hit) => `- ${hit.key}: ${hit.summary}`);

  const overviewExtra = [
    "",
    "### Contextual connections (from Jira / Confluence / memory)",
    research.contextSummary,
    jiraLines.length ? `\nRelated Jira:\n${jiraLines.join("\n")}` : "",
    confluenceLines.length
      ? `\nRelated Confluence:\n${confluenceLines.join("\n")}`
      : "",
    memoryLines.length
      ? `\nHistorical style refs:\n${memoryLines.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const descriptionExtra = [
    "",
    "### Continuity notes",
    "- This is a **new** ticket, not a duplicate of the references above.",
    "- Keep behaviour consistent with related features discovered in search.",
    "- Reuse established BA structure / DoR / Gherkin style from this company's history.",
  ].join("\n");

  const researchBoost =
    research.jiraHits.length + research.confluenceHits.length > 0 ? 0.12 : 0.03;

  return {
    ...draft,
    productOverview: `${draft.productOverview}\n${overviewExtra}`.trim(),
    description: `${draft.description}\n${descriptionExtra}`.trim(),
    confidence: Math.min(0.97, Number((draft.confidence + researchBoost).toFixed(2))),
    research,
    missingFields: draft.missingFields.filter((field) => field !== "richer brief"),
  };
}
