/** Lightweight ticket drafting that mirrors Christie's-style structure. */

function extractEpic(brief) {
  const match = brief.match(/epic\s*:\s*([^\n.]+)/i);
  return match?.[1]?.trim() || "";
}

function extractTitle(brief, account) {
  const match = brief.match(/title\s*:\s*([^\n]+)/i);
  if (match) return match[1].trim();
  const first = brief
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  const base = (first || "New BA ticket").slice(0, 180);
  if (account?.summaryPrefix && !base.startsWith(account.summaryPrefix)) {
    return `${account.summaryPrefix}${base}`;
  }
  return base;
}

function gherkinFromBrief(brief) {
  const lines = brief
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const ac = [];
  for (const line of lines) {
    if (/^(given|when|then|and)\b/i.test(line)) ac.push(line);
  }
  if (ac.length) return ac;
  return [
    "Given a user with access to the feature",
    "When they complete the described flow",
    "Then the expected outcome is visible and persisted",
  ];
}

export function draftFromBrief(brief, account) {
  const text = String(brief || "").trim();
  if (!text) throw new Error("Brief is empty");
  const summary = extractTitle(text, account);
  const epic = extractEpic(text) || account?.defaultEpicKey || "";
  const projectKey = account?.defaultProjectKey || "PROJ";
  const acceptance = gherkinFromBrief(text);
  const description = [
    "h2. Business Context",
    text,
    "",
    "h2. Acceptance Criteria",
    ...acceptance.map((line, i) => `* AC${i + 1}: ${line}`),
    "",
    "h2. Notes",
    `Drafted in Chrome by Ticket Flow Agent for ${account?.name || "this account"}.`,
  ].join("\n");

  return {
    summary,
    description,
    acceptanceCriteria: acceptance,
    projectKey,
    issueType: /bug/i.test(text) ? "Bug" : "Story",
    epicLink: epic || undefined,
    labels: ["ba-assisted", account?.slug || "ticket-flow"].filter(Boolean),
    postCreateStatus: account?.defaultPostCreateStatus || "",
    accountId: account?.id,
  };
}

export function draftToPastePack(draft) {
  return [
    `Summary: ${draft.summary}`,
    `Project: ${draft.projectKey}`,
    `Type: ${draft.issueType}`,
    draft.epicLink ? `Epic: ${draft.epicLink}` : "",
    draft.labels?.length ? `Labels: ${draft.labels.join(", ")}` : "",
    "",
    "Description:",
    draft.description,
  ]
    .filter(Boolean)
    .join("\n");
}
