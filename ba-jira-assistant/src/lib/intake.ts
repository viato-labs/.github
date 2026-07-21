import {
  EMPTY_TECHNICAL_STUB,
  INTENT_META,
} from "@/lib/templates/defaults";
import type {
  CompanyWorkspace,
  GherkinScenario,
  PlaybookId,
  TicketDraft,
  TicketIntent,
} from "@/lib/types";

const INTENT_ALIASES: Array<{ match: RegExp; intent: TicketIntent }> = [
  { match: /\b(bug|defect|broken)\b/i, intent: "bug" },
  { match: /\b(spike|investigate|research)\b/i, intent: "spike" },
  { match: /\b(enabler|tech debt|refactor)\b/i, intent: "tech-enabler" },
  { match: /\b(copy|content|cms|editorial)\b/i, intent: "content-copy" },
  { match: /\b(analytics|tracking|telemetry|gtm|snowplow)\b/i, intent: "analytics-tracking" },
  { match: /\b(integration|api partner|webhook)\b/i, intent: "integration" },
  { match: /\b(qa only|test charter|qa companion)\b/i, intent: "qa-companion" },
  { match: /\b(design|figma|visual|ux)\b/i, intent: "design" },
  { match: /\b(field trip|engagement|site visit|field ops)\b/i, intent: "field-ops" },
];

function detectIntent(text: string, forced?: TicketIntent): TicketIntent {
  if (forced) return forced;
  for (const alias of INTENT_ALIASES) {
    if (alias.match.test(text)) return alias.intent;
  }
  return "feature-story";
}

function pick(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function resolveEpic(
  text: string,
  company: CompanyWorkspace,
): { epicKey?: string; epicName?: string } {
  const memory = company.memory;
  const explicitKey = pick(text, [
    /\bepic\s*(?:key)?\s*[:=]\s*([A-Z][A-Z0-9]+-\d+)/i,
    /\bepic\s+([A-Z][A-Z0-9]+-\d+)\b/i,
  ]);
  if (explicitKey) {
    const name = Object.entries(memory.epicMap).find(([, key]) => key === explicitKey)?.[0];
    return { epicKey: explicitKey, epicName: name };
  }

  const explicitName = pick(text, [/\bepic\s*[:=]\s*([^\n.]+)/i]);
  if (explicitName) {
    const mapped = memory.epicMap[explicitName] || memory.epicMap[explicitName.toLowerCase()];
    if (mapped) return { epicKey: mapped, epicName: explicitName };
    const fuzzy = Object.entries(memory.epicMap).find(([name]) =>
      name.toLowerCase().includes(explicitName.toLowerCase()),
    );
    if (fuzzy) return { epicKey: fuzzy[1], epicName: fuzzy[0] };
    return { epicName: explicitName };
  }

  for (const [name, key] of Object.entries(memory.epicMap)) {
    if (text.toLowerCase().includes(name.toLowerCase())) {
      return { epicKey: key, epicName: name };
    }
  }
  return {};
}

function resolveBoardProject(text: string, company: CompanyWorkspace): string {
  const explicit = pick(text, [/\bproject\s*[:=]\s*([A-Z][A-Z0-9]+)\b/i]);
  if (explicit) return explicit;

  for (const board of company.boards) {
    if (
      text.toLowerCase().includes(board.name.toLowerCase()) ||
      text.toLowerCase().includes(board.projectKey.toLowerCase())
    ) {
      return board.projectKey;
    }
  }
  return company.memory.defaultProjectKey;
}

function buildSummary(intent: TicketIntent, text: string): string {
  const explicit = pick(text, [
    /\b(?:title|summary)\s*[:=]\s*([^\n]+)/i,
    /^#\s+(.+)$/m,
  ]);
  const prefix = INTENT_META[intent].summaryPrefix;
  if (explicit) {
    return prefix && !explicit.startsWith(prefix) ? `${prefix} ${explicit}` : explicit;
  }

  const cleaned = text
    .replace(/\b(epic|project|priority|labels?|company|intent hint)\s*[:=][^\n]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const base =
    cleaned.length > 110 ? `${cleaned.slice(0, 107).trim()}...` : cleaned || "Untitled BA request";
  return prefix ? `${prefix} ${base}` : base;
}

function relatedHistory(company: CompanyWorkspace, text: string, intent: TicketIntent) {
  const lowered = text.toLowerCase();
  return company.memory.historicalTickets
    .filter((ticket) => {
      if (ticket.intent && ticket.intent === intent) return true;
      if (ticket.section && lowered.includes(ticket.section.toLowerCase())) return true;
      return ticket.summary
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.length > 4 && lowered.includes(word));
    })
    .slice(0, 3);
}

function buildProductOverview(
  text: string,
  company: CompanyWorkspace,
  intent: TicketIntent,
): string {
  const overview = pick(text, [
    /\b(?:product overview|overview|context|why)\s*[:=]\s*([\s\S]+?)(?=\n\s*(?:description|ac|acceptance|gherkin|technical|$))/i,
  ]);
  if (overview) return overview.trim();

  const history = relatedHistory(company, text, intent);
  const glossaryHits = Object.entries(company.memory.productGlossary)
    .filter(([term]) => text.toLowerCase().includes(term.toLowerCase()))
    .map(([term, definition]) => `- ${term}: ${definition}`);

  return [
    `Business outcome for ${company.name}: deliver the requested change with clear, testable behaviour.`,
    "",
    `Source brief:\n${text.trim()}`,
    glossaryHits.length ? `\nDomain terms:\n${glossaryHits.join("\n")}` : "",
    history.length
      ? `\nAligned to prior ${company.name} tickets:\n${history
          .map((h) => `- ${h.key}: ${h.summary}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDescription(
  text: string,
  intent: TicketIntent,
  company: CompanyWorkspace,
): string {
  const description = pick(text, [
    /\b(?:description|details|requirements)\s*[:=]\s*([\s\S]+?)(?=\n\s*(?:ac|acceptance|gherkin|technical|dor|$))/i,
  ]);
  if (description) return description.trim();

  if (intent === "design") {
    return [
      "Produce design direction for the described configurator/product section.",
      "",
      "In scope:",
      "- Visual and interaction design aligned to existing company design language",
      "- States: default, hover/focus, selected, disabled/error where relevant",
      "- Handoff-ready notes for engineering",
      "",
      "Out of scope:",
      "- Final engineering implementation decisions",
      "",
      `Company style notes:\n${company.memory.houseStyleNotes.map((n) => `- ${n}`).join("\n")}`,
    ].join("\n");
  }

  if (intent === "field-ops") {
    return [
      "Create/track the field engagement work item with enough operational clarity for the team.",
      "",
      "In scope:",
      "- Capture engagement identity, timing, location/owner, and required actions",
      "- Make follow-up responsibilities obvious",
      "",
      "Out of scope:",
      "- Unrelated product feature work",
      "",
      `Source details:\n${text.trim()}`,
    ].join("\n");
  }

  return [
    "Implement the behaviour described in the product overview.",
    "",
    "In scope:",
    "- Deliver the core user journey implied by the brief",
    "- Surface clear success and failure states where relevant",
    "",
    "Out of scope:",
    "- Unrelated redesigns or opportunistic refactors unless required",
    "",
    "Notes for engineering:",
    "- Prefer existing platform patterns and shared components",
    intent === "bug"
      ? "- Include root-cause notes and regression coverage once fixed"
      : "- Call out any product decisions needed before build",
    "",
    `House style (${company.name}):`,
    ...company.memory.houseStyleNotes.map((n) => `- ${n}`),
  ].join("\n");
}

function buildGherkin(
  text: string,
  intent: TicketIntent,
  summary: string,
): GherkinScenario[] {
  if (!INTENT_META[intent].requireGherkin) return [];

  const action =
    pick(text, [/\b(?:user can|users? can|able to|should)\s+([^\n.]+)/i]) ||
    "complete the described journey";

  return [
    {
      title: `Happy path — ${summary.replace(/^\[.*?\]\s*/, "")}`,
      given: ["the user is eligible to use the feature", "any required data/setup exists"],
      when: [`the user attempts to ${action}`],
      then: ["the system completes the action successfully", "the UI reflects the updated state"],
    },
    {
      title: "Validation / permission edge case",
      given: ["the user is not permitted or required data is missing"],
      when: [`the user attempts to ${action}`],
      then: [
        "the system blocks or degrades safely",
        "the user receives a clear, actionable message",
      ],
    },
  ];
}

function scoreConfidence(input: {
  text: string;
  epicResolved: boolean;
  historyCount: number;
  glossaryHits: number;
  missingFields: string[];
}): number {
  let score = 0.45;
  if (input.text.trim().length > 80) score += 0.1;
  if (input.epicResolved) score += 0.15;
  if (input.historyCount > 0) score += 0.15;
  if (input.glossaryHits > 0) score += 0.08;
  score -= input.missingFields.length * 0.07;
  return Math.max(0.2, Math.min(0.95, Number(score.toFixed(2))));
}

export function buildTicketDraft(
  text: string,
  company: CompanyWorkspace,
  extras?: {
    files?: string[];
    playbookId?: PlaybookId;
    forcedIntent?: TicketIntent;
  },
): TicketDraft {
  const intent = detectIntent(text, extras?.forcedIntent);
  const projectKey = resolveBoardProject(text, company);
  const board = company.boards.find((b) => b.projectKey === projectKey);
  const issueType =
    pick(text, [/\b(?:issue\s*type|type)\s*[:=]\s*([A-Za-z ]+)/i]) ||
    (intent === "bug"
      ? "Bug"
      : intent === "design"
        ? board?.defaultIssueType || "Task"
        : board?.defaultIssueType || company.memory.defaultIssueType);
  const priority = pick(text, [/\bpriority\s*[:=]\s*([A-Za-z]+)/i]);
  const labelsRaw = pick(text, [/\blabels?\s*[:=]\s*([^\n]+)/i]);
  const labels = Array.from(
    new Set([
      ...company.memory.defaultLabels,
      ...INTENT_META[intent].defaultLabels,
      ...(labelsRaw
        ? labelsRaw
            .split(/[, ]+/)
            .map((l) => l.trim())
            .filter(Boolean)
        : []),
    ]),
  );

  const { epicKey, epicName } = resolveEpic(text, company);
  const summary = buildSummary(intent, text);
  const productOverview = buildProductOverview(text, company, intent);
  const description = buildDescription(text, intent, company);
  const gherkin = buildGherkin(text, intent, summary);
  const history = relatedHistory(company, text, intent);
  const glossaryHits = Object.keys(company.memory.productGlossary).filter((term) =>
    text.toLowerCase().includes(term.toLowerCase()),
  ).length;

  const missingFields: string[] = [];
  if (!epicKey && !epicName) missingFields.push("epic");
  if (text.trim().length < 40) missingFields.push("richer brief");
  if (INTENT_META[intent].requireGherkin && gherkin.length === 0) {
    missingFields.push("Gherkin acceptance criteria");
  }

  const confidence = scoreConfidence({
    text,
    epicResolved: Boolean(epicKey || epicName),
    historyCount: history.length,
    glossaryHits,
    missingFields,
  });

  return {
    companyId: company.id,
    intent,
    summary,
    projectKey,
    issueType,
    epicKey,
    epicName,
    labels,
    priority,
    productOverview,
    description,
    technical: { ...EMPTY_TECHNICAL_STUB },
    gherkin,
    definitionOfReady: company.memory.definitionOfReady,
    attachments: extras?.files || [],
    sourceNotes: text.trim(),
    missingFields,
    confidence,
    playbookId: extras?.playbookId,
  };
}

export function buildAssistantReply(
  draft: TicketDraft,
  company: CompanyWorkspace,
): string {
  const gaps =
    draft.missingFields.length === 0
      ? "Core BA fields look filled enough for autonomous create."
      : `Still thin on: ${draft.missingFields.join(", ")}.`;

  const research = draft.research;
  const researchLines = research
    ? [
        `- Live Jira matches: ${research.jiraHits.length}`,
        `- Live Confluence matches: ${research.confluenceHits.length}`,
        `- ${research.contextSummary}`,
      ]
    : [
        `- Historical refs in memory: ${company.memory.historicalTickets.length}`,
        `- Confluence pages in memory: ${company.memory.confluencePages?.length || 0}`,
      ];

  return [
    `Drafted a **${draft.intent}** ticket for **${company.name}** (confidence ${Math.round(draft.confidence * 100)}%):`,
    "",
    `- Summary: ${draft.summary}`,
    `- Board/project: ${draft.projectKey} / ${draft.issueType}`,
    `- Epic: ${draft.epicName || "unmapped"}${draft.epicKey ? ` (${draft.epicKey})` : ""}`,
    `- Labels: ${draft.labels.join(", ") || "none"}`,
    `- Gherkin scenarios: ${draft.gherkin.length}`,
    ...researchLines,
    "",
    gaps,
    "",
    "This is treated as a **new** ticket, written with contextual continuity from that company's Jira/Confluence/history — not a copy of an old ticket.",
  ].join("\n");
}
