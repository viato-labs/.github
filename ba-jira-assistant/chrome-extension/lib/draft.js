/** Human-voiced drafts from BA guidance + researched context. */

export function extractLinks(text, extra = []) {
  const found = String(text || "").match(/https?:\/\/[^\s)]+/g) || [];
  return [...new Set([...extra, ...found].map((l) => l.replace(/[.,;]+$/, "")))];
}

function titleFrom(guidance, kind) {
  const explicit = guidance.match(/^(?:title|summary)\s*:\s*(.+)$/im)?.[1]?.trim();
  if (explicit) return explicit.slice(0, 180);
  const heading = guidance.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 180);
  const first = guidance
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^https?:/i.test(l));
  let base = (first || "Follow-up from BA guidance").replace(/^[-*•]\s*/, "");
  if (accountPrefixNeeds(kind, base)) {
    /* handled below */
  }
  if (base.length > 110) base = `${base.slice(0, 107)}…`;
  if (kind === "qa" && !/qa|test/i.test(base)) return `QA: ${base}`;
  if (kind === "analysis" && !/analy|spike/i.test(base)) return `Analyse: ${base}`;
  return base;
}

function accountPrefixNeeds() {
  return false;
}

function splitTopics(guidance) {
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

function refsBlock(links, researchNote) {
  const figma = links.filter((l) => /figma\.com/i.test(l));
  const confluence = links.filter((l) => /atlassian\.net\/wiki|confluence/i.test(l));
  const other = links.filter((l) => !figma.includes(l) && !confluence.includes(l));
  const lines = [];
  if (figma.length || confluence.length || other.length) {
    lines.push("", "References I'm working from:");
    for (const l of figma) lines.push(`- Figma: ${l}`);
    for (const l of confluence) lines.push(`- Confluence: ${l}`);
    for (const l of other) lines.push(`- ${l}`);
  }
  if (researchNote) lines.push("", researchNote);
  return lines.join("\n");
}

function gherkinLines() {
  return [
    "Given I can reach the area described in the guidance",
    "When I follow the main flow a real user would try",
    "Then I get the outcome described",
    "And it still looks right after refresh",
  ];
}

/**
 * @param {{ guidance: string, links?: string[], audience: string, account: object, researchNote?: string }} input
 */
export function draftsFromGuidance(input) {
  const links = extractLinks(input.guidance, input.links || []);
  const topics = splitTopics(input.guidance || "");
  const refs = refsBlock(links, input.researchNote || "");
  const account = input.account;
  const drafts = [];

  for (const topic of topics) {
    if (input.audience === "analysis") {
      const summary = withPrefix(titleFrom(topic, "analysis"), account);
      drafts.push({
        summary,
        projectKey: account.defaultProjectKey,
        issueType: "Story",
        labels: ["ba-assisted", account.slug, "analysis"],
        postCreateStatus: account.defaultPostCreateStatus,
        description: [
          "I need to understand this properly before we commit build work.",
          "",
          "What I'm looking at:",
          topic,
          refs,
          "",
          "What good looks like:",
          "- Clear problem and who it affects",
          "- What already exists vs what changes",
          "- Suggested split into build + QA tickets",
        ].join("\n"),
      });
      continue;
    }

    if (input.audience === "qa" || input.audience === "both") {
      const summary = withPrefix(titleFrom(topic, "qa"), account);
      const ac = gherkinLines();
      drafts.push({
        summary,
        projectKey: account.defaultProjectKey,
        issueType: "Task",
        labels: ["ba-assisted", account.slug, "qa"],
        postCreateStatus: account.defaultPostCreateStatus,
        description: [
          "I want QA coverage that mirrors how a real user would try this.",
          "",
          "Context:",
          topic,
          refs,
          "",
          "Acceptance criteria:",
          ...ac.map((l, i) => `${i + 1}. ${l}`),
        ].join("\n"),
      });
    }

    if (input.audience === "dev" || input.audience === "both") {
      const summary = withPrefix(titleFrom(topic, "dev"), account);
      const ac = gherkinLines();
      drafts.push({
        summary,
        projectKey: account.defaultProjectKey,
        issueType: "Story",
        labels: ["ba-assisted", account.slug, "dev"],
        postCreateStatus: account.defaultPostCreateStatus,
        description: [
          "Here's what I need built, in plain language.",
          "",
          "Why this matters / what should change:",
          topic,
          refs,
          "",
          "Please keep wording consistent with related Jira/Confluence where it still applies.",
          "",
          "Done when:",
          ...ac.map((l, i) => `${i + 1}. ${l}`),
        ].join("\n"),
      });
    }
  }

  return drafts;
}

function withPrefix(summary, account) {
  if (account?.summaryPrefix && !summary.startsWith(account.summaryPrefix)) {
    return `${account.summaryPrefix}${summary}`;
  }
  return summary;
}

export function draftFromBrief(brief, account) {
  return draftsFromGuidance({
    guidance: brief,
    audience: "dev",
    account,
  })[0];
}

export function draftToPastePack(draft) {
  return [
    `Summary: ${draft.summary}`,
    `Project: ${draft.projectKey}`,
    `Type: ${draft.issueType}`,
    "",
    "Description:",
    draft.description,
  ].join("\n");
}
