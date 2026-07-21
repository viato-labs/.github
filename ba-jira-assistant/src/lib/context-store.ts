import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_DEFINITION_OF_READY } from "@/lib/templates/defaults";
import type { ContextMemory } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const MEMORY_PATH = path.join(DATA_DIR, "context-memory.json");

function emptyMemory(): ContextMemory {
  return {
    updatedAt: new Date().toISOString(),
    productGlossary: {
      "my lots": "Signed-in collector area for saved / followed lots",
      "lot": "An auction item available for bidding or purchase",
      "consignor": "Party consigning property for sale",
    },
    epicMap: {
      Discovery: "EPIC-100",
      Checkout: "EPIC-200",
      "My Account": "EPIC-300",
    },
    defaultProjectKey: process.env.JIRA_DEFAULT_PROJECT || "PROJ",
    defaultIssueType: process.env.JIRA_DEFAULT_ISSUE_TYPE || "Story",
    defaultLabels: ["ba-assisted"],
    definitionOfReady: DEFAULT_DEFINITION_OF_READY,
    houseStyleNotes: [
      "Product Overview first, then Description, Technical stub, Gherkin QA, Definition of Ready table.",
      "Technical Information is intentionally incomplete — developers fill it.",
      "DoR table should match the golden ticket paste used by BAs in chat/Jira.",
    ],
    briefs: [],
    createdTickets: [],
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadMemory(): Promise<ContextMemory> {
  await ensureDir();
  try {
    const raw = await fs.readFile(MEMORY_PATH, "utf8");
    return JSON.parse(raw) as ContextMemory;
  } catch {
    const memory = emptyMemory();
    await saveMemory(memory);
    return memory;
  }
}

export async function saveMemory(memory: ContextMemory): Promise<void> {
  await ensureDir();
  memory.updatedAt = new Date().toISOString();
  await fs.writeFile(MEMORY_PATH, JSON.stringify(memory, null, 2), "utf8");
}

export async function rememberBrief(text: string, files: string[] = []) {
  const memory = await loadMemory();
  memory.briefs.unshift({
    id: `brief_${Date.now()}`,
    createdAt: new Date().toISOString(),
    text,
    files,
  });
  memory.briefs = memory.briefs.slice(0, 100);
  await saveMemory(memory);
  return memory;
}

export async function rememberCreatedTicket(input: {
  key: string;
  summary: string;
  dryRun: boolean;
}) {
  const memory = await loadMemory();
  memory.createdTickets.unshift({
    ...input,
    createdAt: new Date().toISOString(),
  });
  memory.createdTickets = memory.createdTickets.slice(0, 200);
  await saveMemory(memory);
  return memory;
}

export async function upsertEpic(name: string, key: string) {
  const memory = await loadMemory();
  memory.epicMap[name] = key;
  await saveMemory(memory);
  return memory;
}

export async function replaceDefinitionOfReady(
  rows: ContextMemory["definitionOfReady"],
) {
  const memory = await loadMemory();
  memory.definitionOfReady = rows;
  await saveMemory(memory);
  return memory;
}
