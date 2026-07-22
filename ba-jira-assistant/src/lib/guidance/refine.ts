import type { GherkinScenario, TicketDraft } from "@/lib/types";
import { draftToMarkdown } from "@/lib/templates/ticket-body";

export type RefineTarget = "all" | number;

export type RefineResult = {
  drafts: TicketDraft[];
  reply: string;
  target: RefineTarget;
};

function cloneDraft(draft: TicketDraft): TicketDraft {
  return {
    ...draft,
    labels: [...draft.labels],
    attachments: [...draft.attachments],
    missingFields: [...draft.missingFields],
    gherkin: draft.gherkin.map((scenario) => ({
      ...scenario,
      given: [...scenario.given],
      when: [...scenario.when],
      then: [...scenario.then],
    })),
    definitionOfReady: draft.definitionOfReady.map((row) => ({ ...row })),
    technical: { ...draft.technical },
  };
}

function resolveTarget(message: string, count: number): RefineTarget {
  const ticketMatch = message.match(/\b(?:ticket|draft|#)\s*(\d+)\b/i);
  if (ticketMatch) {
    const index = Number(ticketMatch[1]) - 1;
    if (index >= 0 && index < count) return index;
  }
  if (/\b(all|every|entire stack|whole pack)\b/i.test(message)) return "all";
  if (/\b(qa|test)\b/i.test(message) && !/\b(dev|build|implement)\b/i.test(message)) {
    return "all";
  }
  return "all";
}

function renameSummary(draft: TicketDraft, message: string): boolean {
  const rename =
    message.match(
      /(?:rename|title|summary)\s+(?:to|as|:)\s*[“"']?(.+?)[”"']?\s*$/i,
    ) || message.match(/^call (?:it|this)\s*[“"']?(.+?)[”"']?\s*$/i);
  if (!rename?.[1]) return false;
  draft.summary = rename[1].trim().slice(0, 180);
  return true;
}

function shortenSummary(draft: TicketDraft): void {
  if (draft.summary.length <= 72) return;
  draft.summary = `${draft.summary.slice(0, 69).replace(/\s+\S*$/, "")}…`;
}

function appendNote(draft: TicketDraft, note: string): void {
  const trimmed = note.trim();
  if (!trimmed) return;
  draft.description = `${draft.description.trim()}\n\nBA follow-up:\n${trimmed}`;
  draft.sourceNotes = `${draft.sourceNotes}\n${trimmed}`.trim();
}

function addGherkin(draft: TicketDraft): void {
  const extra: GherkinScenario = {
    title: "Edge case from BA review",
    given: ["I am in the same starting place as the happy path"],
    when: ["I try an awkward or incomplete version of the flow"],
    then: [
      "the product stays clear and safe",
      "I can recover or understand what to do next",
    ],
  };
  draft.gherkin = [...draft.gherkin, extra];
}

function softenTone(draft: TicketDraft): void {
  draft.description = draft.description
    .replace(/\bmust\b/gi, "should")
    .replace(/\brequired\b/gi, "needed")
    .replace(/\bimmediately\b/gi, "as soon as practical");
  draft.productOverview = draft.productOverview
    .replace(/\bmust\b/gi, "should")
    .replace(/\brequired\b/gi, "needed");
}

function tightenTone(draft: TicketDraft): void {
  if (!/^Here's what I need|^I want QA|^I need to understand/i.test(draft.description)) {
    return;
  }
  draft.description = draft.description
    .replace(/^Here's what I need built, in plain language\./i, "Build requirement:")
    .replace(
      /^I want QA coverage that mirrors how a real user would try this — not a checklist of fields\./i,
      "QA acceptance focus:",
    );
}

function applyLabels(draft: TicketDraft, message: string): boolean {
  const add = message.match(/add label[s]?\s*[:=]?\s*([a-z0-9,_-\s]+)/i);
  if (!add?.[1]) return false;
  const labels = add[1]
    .split(/[,\s]+/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  draft.labels = [...new Set([...draft.labels, ...labels])];
  return true;
}

function applyToDraft(draft: TicketDraft, message: string): string[] {
  const actions: string[] = [];
  const lower = message.toLowerCase();

  if (renameSummary(draft, message)) actions.push("updated the summary");
  if (/\b(shorten|shorter|tighter)\b.*\b(title|summary)\b|\b(title|summary)\b.*\b(shorten|shorter)\b/i.test(message)) {
    shortenSummary(draft);
    actions.push("shortened the summary");
  }
  if (/\b(add|more)\b.*\b(gherkin|acceptance|scenario|ac)\b/i.test(message)) {
    addGherkin(draft);
    actions.push("added an acceptance scenario");
  }
  if (/\b(softer|friendlier|less forceful|tone soft)\b/i.test(message)) {
    softenTone(draft);
    actions.push("softened the tone");
  }
  if (/\b(tighter|crisper|more direct|formal)\b/i.test(message)) {
    tightenTone(draft);
    actions.push("tightened the wording");
  }
  if (applyLabels(draft, message)) actions.push("added labels");

  if (/\b(drop|remove)\b.*\b(technical|tech stub)\b/i.test(message)) {
    draft.technical = {
      approach: "",
      servicesApis: "",
      dataModel: "",
      featureFlags: "",
      rolloutMonitoring: "",
      openQuestions: "",
    };
    actions.push("cleared the technical stub");
  }

  // Freeform instruction: append as BA note when no structured action matched.
  if (!actions.length) {
    appendNote(draft, message);
    actions.push("added your note into the description for rewrite");
  }

  draft.confidence = Math.min(0.95, draft.confidence + 0.02);
  draft.sourceNotes = `${draft.sourceNotes}\n[refine] ${message}`.trim();
  void lower;
  return actions;
}

/** Apply a BA chat instruction to one or all drafts during review. */
export function refineDraftsWithChat(input: {
  drafts: TicketDraft[];
  message: string;
  targetIndex?: number | null;
}): RefineResult {
  const message = input.message.trim();
  if (!message) {
    return {
      drafts: input.drafts.map(cloneDraft),
      reply: "Tell me what to change — e.g. “shorten ticket 1 title” or “add another QA scenario”.",
      target: "all",
    };
  }

  const drafts = input.drafts.map(cloneDraft);
  const target: RefineTarget =
    typeof input.targetIndex === "number" &&
    input.targetIndex >= 0 &&
    input.targetIndex < drafts.length
      ? input.targetIndex
      : resolveTarget(message, drafts.length);

  const indexes =
    target === "all" ? drafts.map((_, index) => index) : [target];

  const actionSets: string[] = [];
  for (const index of indexes) {
    actionSets.push(...applyToDraft(drafts[index], message));
  }

  const uniqueActions = [...new Set(actionSets)];
  const scope =
    target === "all"
      ? `all ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`
      : `ticket ${target + 1}`;

  return {
    drafts,
    target,
    reply: `Updated ${scope}: ${uniqueActions.join(", ")}. You can keep editing by hand or ask again.`,
  };
}

export function previewsFromDrafts(drafts: TicketDraft[]) {
  return drafts.map((draft) => ({
    summary: draft.summary,
    projectKey: draft.projectKey,
    intent: draft.intent,
    confidence: draft.confidence,
    markdown: draftToMarkdown(draft),
    draft,
  }));
}
