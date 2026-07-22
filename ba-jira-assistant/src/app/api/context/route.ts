import { NextResponse } from "next/server";
import type { DorRow } from "@/lib/types";
import {
  getCompany,
  replaceDefinitionOfReady,
  saveCompanyMemory,
  upsertEpic,
} from "@/lib/workspaces/store";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") || undefined;
  const company = await getCompany(companyId);
  return NextResponse.json({
    companyId: company.id,
    companyName: company.name,
    memory: company.memory,
    boards: company.boards,
    playbooks: company.playbooks,
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    epic?: { name: string; key: string };
    definitionOfReady?: DorRow[];
    glossaryEntry?: { term: string; definition: string };
    houseStyleNote?: string;
    section?: string;
    defaultProjectKey?: string;
    defaultIssueType?: string;
  };

  const company = await getCompany(body.companyId);
  let memory = company.memory;

  if (body.epic?.name && body.epic?.key) {
    memory = (await upsertEpic(company.id, body.epic.name, body.epic.key)).memory;
  }
  if (body.definitionOfReady) {
    memory = (await replaceDefinitionOfReady(company.id, body.definitionOfReady))
      .memory;
  }
  if (body.glossaryEntry?.term) {
    memory.productGlossary[body.glossaryEntry.term] = body.glossaryEntry.definition;
    await saveCompanyMemory(company.id, memory);
  }
  if (body.houseStyleNote) {
    memory.houseStyleNotes.unshift(body.houseStyleNote);
    await saveCompanyMemory(company.id, memory);
  }
  if (body.section) {
    if (!memory.sections.includes(body.section)) {
      memory.sections.push(body.section);
      await saveCompanyMemory(company.id, memory);
    }
  }
  if (body.defaultProjectKey) {
    memory.defaultProjectKey = body.defaultProjectKey;
    await saveCompanyMemory(company.id, memory);
  }
  if (body.defaultIssueType) {
    memory.defaultIssueType = body.defaultIssueType;
    await saveCompanyMemory(company.id, memory);
  }

  const refreshed = await getCompany(company.id);
  return NextResponse.json({
    companyId: refreshed.id,
    memory: refreshed.memory,
  });
}
