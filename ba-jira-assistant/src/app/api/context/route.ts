import { NextResponse } from "next/server";
import {
  loadMemory,
  replaceDefinitionOfReady,
  saveMemory,
  upsertEpic,
} from "@/lib/context-store";
import type { DorRow } from "@/lib/types";

export async function GET() {
  const memory = await loadMemory();
  return NextResponse.json(memory);
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    epic?: { name: string; key: string };
    definitionOfReady?: DorRow[];
    glossaryEntry?: { term: string; definition: string };
    houseStyleNote?: string;
    defaultProjectKey?: string;
    defaultIssueType?: string;
  };

  let memory = await loadMemory();

  if (body.epic?.name && body.epic?.key) {
    memory = await upsertEpic(body.epic.name, body.epic.key);
  }
  if (body.definitionOfReady) {
    memory = await replaceDefinitionOfReady(body.definitionOfReady);
  }
  if (body.glossaryEntry?.term) {
    memory.productGlossary[body.glossaryEntry.term] = body.glossaryEntry.definition;
    await saveMemory(memory);
  }
  if (body.houseStyleNote) {
    memory.houseStyleNotes.unshift(body.houseStyleNote);
    await saveMemory(memory);
  }
  if (body.defaultProjectKey) {
    memory.defaultProjectKey = body.defaultProjectKey;
    await saveMemory(memory);
  }
  if (body.defaultIssueType) {
    memory.defaultIssueType = body.defaultIssueType;
    await saveMemory(memory);
  }

  return NextResponse.json(await loadMemory());
}
