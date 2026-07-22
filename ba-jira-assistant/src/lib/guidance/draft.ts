import { EMPTY_TECHNICAL_STUB } from "@/lib/templates/defaults";
import type {
  CompanyWorkspace,
  GherkinScenario,
  ResearchBundle,
  TicketDraft,
  TicketIntent,
} from "@/lib/types";

export type TicketAudience = "dev" | "qa" | "both" | "analysis";

export type GuidanceInput = {
  guidance: string;
  links?: string[];
  files?: string[];
  audience: TicketAudience;
  company: CompanyWorkspace;
  research?: ResearchBundle | null;
};

function extractLinks(text: string, extra: string[] = []): string[] {
  const found = text.match(/https?:\/\/[^\s)]+/g) || [];
  return [...new Set([...extra, ...found].map((l) => l.replace(/[.,;]+$/, "")))];
}

function humanTitle(guidance: string, kind: string): string {
  const explicit = guidance.match(/^(?:title|summary)\s*:\s*(.+)$/im)?.[1]?.trim();
  if (explicit) return explicit.slice(0, 180);

  const heading = guidance.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 180);

  const first = guidance
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^https?:/i.test(l) && !/^file:/i.test(l));
  const base = (first || "Follow-up work from BA guidance").replace(/^[-*•]\s*/, "");
  const clipped = base.length > 110 ? `${base.slice(0, 107)}…` : base;
  if (kind === "qa" && !/qa|test/i.test(clipped)) return `QA: ${clipped}`;
  if (kind === "analysis" && !/analy|spike|discover/i.test(clipped)) {
    return `Analyse: ${clipped}`;
  }
  return clipped;
}

function contextBlock(research?: ResearchBundle | null): string {
  if (!research) return "";
  const bits: string[] = [];
  for (const hit of research.jiraHits.slice(0, 5)) {
    bits.push(`- Related Jira ${hit.id}: ${hit.title}`);
  }
  for (const hit of research.confluenceHits.slice(0, 4)) {
    bits.push(`- Confluence: ${hit.title}${hit.url ? ` (${hit.url})` : ""}`);
  }
  if (!bits.length) return "";
  return ["", "What I already checked for context:", ...bits].join("\n");
}

function linkBlock(links: string[]): string {
  if (!links.length) return "";
  const figma = links.filter((l) => /figma\.com/i.test(l));
  const confluence = links.filter((l) => /atlassian\.net\/wiki|confluence/i.test(l));
  const other = links.filter((l) => !figma.includes(l) && !confluence.includes(l));
  const lines = ["", "References I'm working from:"];
  for (const l of figma) lines.push(`- Figma: ${l}`);
  for (const l of confluence) lines.push(`- Confluence: ${l}`);
  for (const l of other) lines.push(`- ${l}`);
  return lines.join("\n");
}

function fileBlock(files: string[]): string {
  if (!files.length) return "";
  return [
    "",
    "Source material attached:",
    ...files.slice(0, 8).map((f) => {
      const name = f.match(/^FILE:\s*(.+)$/m)?.[1] || "attachment";
      return `- ${name}`;
    }),
  ].join("\n");
}

function gherkinFor(guidance: string, summary: string): GherkinScenario[] {
  const lines = guidance
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(given|when|then|and)\b/i.test(l));
  if (lines.length >= 3) {
    return [
      {
        title: `From guidance — ${summary}`,
        given: lines.filter((l) => /^given\b/i.test(l)).map((l) => l.replace(/^given\s+/i, "")),
        when: lines.filter((l) => /^when\b/i.test(l)).map((l) => l.replace(/^when\s+/i, "")),
        then: lines
          .filter((l) => /^(then|and)\b/i.test(l))
          .map((l) => l.replace(/^(then|and)\s+/i, "")),
      },
    ];
  }
  return [
    {
      title: `Happy path — ${summary}`,
      given: [
        "I can reach the area described in the guidance",
        "any required setup or data is already in place",
      ],
      when: ["I follow the main flow a real user would try"],
      then: [
        "I get the outcome described in the guidance",
        "the result still looks right after I refresh",
      ],
    },
    {
      title: "Clear failure / empty state",
      given: ["something required is missing or I am not allowed"],
      when: ["I try the same flow"],
      then: [
        "the product fails safely",
        "I get a clear message — not a blank or broken screen",
      ],
    },
  ];
}

function splitTopics(guidance: string): string[] {
  const byHeading = guidance
    .split(/\n(?=#{1,3}\s+)/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  if (byHeading.length > 1) return byHeading.slice(0, 6);

  const byBreak = guidance
    .split(/\n\s*---\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  if (byBreak.length > 1) return byBreak.slice(0, 6);

  return [guidance.trim()];
}

function makeDraft(input: {
  company: CompanyWorkspace;
  summary: string;
  productOverview: string;
  description: string;
  intent: TicketIntent;
  gherkin: GherkinScenario[];
  labels: string[];
  files: string[];
  sourceNotes: string;
  research?: ResearchBundle | null;
}): TicketDraft {
  return {
    companyId: input.company.id,
    intent: input.intent,
    summary: input.summary,
    projectKey: input.company.memory.defaultProjectKey,
    issueType: input.intent === "qa-companion" ? "Task" : "Story",
    labels: [
      ...new Set([
        ...input.company.memory.defaultLabels,
        input.company.slug,
        ...input.labels,
      ]),
    ],
    priority: "Medium",
    productOverview: input.productOverview,
    description: input.description,
    technical: { ...EMPTY_TECHNICAL_STUB },
    gherkin: input.gherkin,
    definitionOfReady: input.company.memory.definitionOfReady,
    attachments: input.files,
    sourceNotes: input.sourceNotes,
    missingFields: [],
    confidence: 0.78,
    playbookId: "single-brief",
    research: input.research || undefined,
  };
}

/** Build human-voiced ticket drafts from BA guidance + optional research. */
export function draftsFromGuidance(input: GuidanceInput): TicketDraft[] {
  const links = extractLinks(input.guidance, input.links || []);
  const files = input.files || [];
  const topics = splitTopics(input.guidance);
  const researchNote = contextBlock(input.research);
  const refs = `${linkBlock(links)}${fileBlock(files)}${researchNote}`;
  const drafts: TicketDraft[] = [];

  for (const topic of topics) {
    if (input.audience === "analysis") {
      const summary = humanTitle(topic, "analysis");
      drafts.push(
        makeDraft({
          company: input.company,
          summary,
          intent: "spike",
          labels: ["analysis"],
          files,
          sourceNotes: topic,
          research: input.research,
          productOverview:
            "I need to understand this properly before we commit build work.",
          description: [
            "I need to understand this properly before we commit build work.",
            "",
            "What I'm looking at:",
            topic.trim(),
            refs,
            "",
            "What good looks like from this analysis:",
            "- Clear problem statement and who it affects",
            "- What already exists (Jira / Confluence / Figma) vs what changes",
            "- Recommended ticket split for build and QA",
          ].join("\n"),
          gherkin: [],
        }),
      );
      continue;
    }

    if (input.audience === "qa" || input.audience === "both") {
      const summary = humanTitle(topic, "qa");
      const gherkin = gherkinFor(topic, summary);
      drafts.push(
        makeDraft({
          company: input.company,
          summary,
          intent: "qa-companion",
          labels: ["qa"],
          files,
          sourceNotes: topic,
          research: input.research,
          productOverview:
            "QA coverage that mirrors how a real user would try this.",
          description: [
            "I want QA coverage that mirrors how a real user would try this — not a checklist of fields.",
            "",
            "Context:",
            topic.trim(),
            refs,
          ].join("\n"),
          gherkin,
        }),
      );
    }

    if (input.audience === "dev" || input.audience === "both") {
      const summary = humanTitle(topic, "dev");
      const gherkin = gherkinFor(topic, summary);
      drafts.push(
        makeDraft({
          company: input.company,
          summary,
          intent: "feature-story",
          labels: ["dev"],
          files,
          sourceNotes: topic,
          research: input.research,
          productOverview: "What I need built, in plain language.",
          description: [
            "Here's what I need built, in plain language.",
            "",
            "Why this matters / what should change:",
            topic.trim(),
            refs,
            "",
            "Please keep wording and patterns consistent with the related tickets and Confluence notes above where they still apply.",
          ].join("\n"),
          gherkin,
        }),
      );
    }
  }

  return drafts;
}
