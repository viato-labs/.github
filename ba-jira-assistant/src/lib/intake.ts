import {
  DEFAULT_DEFINITION_OF_READY,
  EMPTY_TECHNICAL_STUB,
  INTENT_META,
} from "@/lib/templates/defaults";
import type { ContextMemory, GherkinScenario, TicketDraft, TicketIntent } from "@/lib/types";

const INTENT_ALIASES: Array<{ match: RegExp; intent: TicketIntent }> = [
  { match: /\b(bug|defect|broken)\b/i, intent: "bug" },
  { match: /\b(spike|investigate|research)\b/i, intent: "spike" },
  { match: /\b(enabler|tech debt|refactor)\b/i, intent: "tech-enabler" },
  { match: /\b(copy|content|cms|editorial)\b/i, intent: "content-copy" },
  { match: /\b(analytics|tracking|telemetry|gtm|snowplow)\b/i, intent: "analytics-tracking" },
  { match: /\b(integration|api partner|webhook)\b/i, intent: "integration" },
  { match: /\b(qa only|test charter|qa companion)\b/i, intent: "qa-companion" },
];

function detectIntent(text: string): TicketIntent {
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
  memory: ContextMemory,
): { epicKey?: string; epicName?: string } {
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
    .replace(/\b(epic|project|priority|labels?)\s*[:=][^\n]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const base =
    cleaned.length > 110 ? `${cleaned.slice(0, 107).trim()}...` : cleaned || "Untitled BA request";
  return prefix ? `${prefix} ${base}` : base;
}

function buildProductOverview(text: string): string {
  const overview = pick(text, [
    /\b(?:product overview|overview|context|why)\s*[:=]\s*([\s\S]+?)(?=\n\s*(?:description|ac|acceptance|gherkin|technical|$))/i,
  ]);
  if (overview) return overview.trim();
  return (
    "Business outcome: deliver the requested user-facing change with clear, testable behaviour.\n\n" +
    `Source brief:\n${text.trim()}`
  );
}

function buildDescription(text: string, intent: TicketIntent): string {
  const description = pick(text, [
    /\b(?:description|details|requirements)\s*[:=]\s*([\s\S]+?)(?=\n\s*(?:ac|acceptance|gherkin|technical|dor|$))/i,
  ]);
  if (description) return description.trim();

  const lines = [
    "Implement the behaviour described in the product overview.",
    "",
    "In scope:",
    "- Deliver the core user journey implied by the brief",
    "- Surface clear success and failure states to the user where relevant",
    "",
    "Out of scope:",
    "- Unrelated redesigns or opportunistic refactors unless required for delivery",
    "",
    "Notes for engineering:",
    "- Prefer existing platform patterns and shared components",
    intent === "bug"
      ? "- Include root-cause notes and regression coverage once fixed"
      : "- Call out any product decisions needed before build",
  ];
  return lines.join("\n");
}

function buildGherkin(text: string, intent: TicketIntent, summary: string): GherkinScenario[] {
  if (!INTENT_META[intent].requireGherkin) return [];

  const explicitScenario = pick(text, [
    /\b(?:gherkin|acceptance criteria|ac)\s*[:=]\s*([\s\S]+)/i,
  ]);
  if (explicitScenario && /given|when|then/i.test(explicitScenario)) {
    return [
      {
        title: summary.replace(/^\[.*?\]\s*/, ""),
        given: ["the preconditions described by the BA are met"],
        when: ["the user performs the described action"],
        then: [explicitScenario.replace(/\s+/g, " ").trim()],
      },
    ];
  }

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

export function buildTicketDraft(
  text: string,
  memory: ContextMemory,
  extras?: { files?: string[] },
): TicketDraft {
  const intent = detectIntent(text);
  const projectKey =
    pick(text, [/\bproject\s*[:=]\s*([A-Z][A-Z0-9]+)\b/i]) || memory.defaultProjectKey;
  const issueType =
    pick(text, [/\b(?:issue\s*type|type)\s*[:=]\s*([A-Za-z ]+)/i]) ||
    (intent === "bug" ? "Bug" : memory.defaultIssueType);
  const priority = pick(text, [/\bpriority\s*[:=]\s*([A-Za-z]+)/i]);
  const labelsRaw = pick(text, [/\blabels?\s*[:=]\s*([^\n]+)/i]);
  const labels = Array.from(
    new Set([
      ...memory.defaultLabels,
      ...INTENT_META[intent].defaultLabels,
      ...(labelsRaw
        ? labelsRaw.split(/[, ]+/).map((l) => l.trim()).filter(Boolean)
        : []),
    ]),
  );

  const { epicKey, epicName } = resolveEpic(text, memory);
  const summary = buildSummary(intent, text);
  const productOverview = buildProductOverview(text);
  const description = buildDescription(text, intent);
  const gherkin = buildGherkin(text, intent, summary);

  const missingFields: string[] = [];
  if (!epicKey && !epicName) missingFields.push("epic");
  if (productOverview.includes("Source brief:") && text.trim().length < 40) {
    missingFields.push("richer product overview / business outcome");
  }
  if (INTENT_META[intent].requireGherkin && gherkin.length === 0) {
    missingFields.push("Gherkin acceptance criteria");
  }

  return {
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
    definitionOfReady: memory.definitionOfReady.length
      ? memory.definitionOfReady
      : DEFAULT_DEFINITION_OF_READY,
    attachments: extras?.files || [],
    sourceNotes: text.trim(),
    missingFields,
  };
}

export function buildAssistantReply(draft: TicketDraft): string {
  const gaps =
    draft.missingFields.length === 0
      ? "All core BA fields look filled enough for a preview."
      : `Still thin on: ${draft.missingFields.join(", ")}. You can answer those next, or create as-is.`;

  return [
    `Drafted a **${draft.intent}** ticket:`,
    "",
    `- Summary: ${draft.summary}`,
    `- Project: ${draft.projectKey} / ${draft.issueType}`,
    `- Epic: ${draft.epicName || "unmapped"}${draft.epicKey ? ` (${draft.epicKey})` : ""}`,
    `- Labels: ${draft.labels.join(", ") || "none"}`,
    `- Gherkin scenarios: ${draft.gherkin.length}`,
    `- DoR rows: ${draft.definitionOfReady.length}`,
    "",
    gaps,
    "",
    "Use **Preview** to inspect the full house-style body, or **Create in Jira** to push it (dry-run unless credentials are configured).",
  ].join("\n");
}
