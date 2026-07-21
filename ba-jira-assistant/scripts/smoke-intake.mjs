import assert from "node:assert/strict";

// Lightweight runtime check without TS path aliases.
const memory = {
  updatedAt: new Date().toISOString(),
  productGlossary: {},
  epicMap: { Discovery: "EPIC-100" },
  defaultProjectKey: "WEB",
  defaultIssueType: "Story",
  defaultLabels: ["ba-assisted"],
  definitionOfReady: [
    { criterion: "AC clear", status: "Yes", notes: "" },
  ],
  houseStyleNotes: [],
  briefs: [],
  createdTickets: [],
};

const text =
  "Buyers need to save a lot from search results on web. Epic: Discovery. Priority: High.";

const epicKeyMatch = text.match(/\bepic\s*[:=]\s*([^\n.]+)/i);
assert.ok(epicKeyMatch);
const epicName = epicKeyMatch[1].trim();
assert.equal(memory.epicMap[epicName], "EPIC-100");
assert.match(text, /Priority:\s*High/i);

console.log("smoke-intake: ok");
