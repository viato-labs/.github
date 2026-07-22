/**
 * Compatibility shim. Prefer `@/lib/workspaces/store` with an explicit company id.
 * These helpers operate on the active company workspace only.
 */
import type { DorRow } from "@/lib/types";
import {
  getCompany,
  rememberBrief as rememberBriefForCompany,
  rememberCreatedTicket as rememberCreatedTicketForCompany,
  replaceDefinitionOfReady as replaceDorForCompany,
  saveCompanyMemory,
  upsertEpic as upsertEpicForCompany,
} from "@/lib/workspaces/store";

export async function loadMemory() {
  return (await getCompany()).memory;
}

export async function saveMemory(
  memory: Awaited<ReturnType<typeof loadMemory>>,
) {
  const company = await getCompany();
  await saveCompanyMemory(company.id, memory);
}

export async function rememberBrief(text: string, files: string[] = []) {
  const company = await rememberBriefForCompany(
    (await getCompany()).id,
    text,
    files,
  );
  return company.memory;
}

export async function rememberCreatedTicket(input: {
  key: string;
  summary: string;
  dryRun: boolean;
  playbookId?: string;
}) {
  const company = await rememberCreatedTicketForCompany(
    (await getCompany()).id,
    input,
  );
  return company.memory;
}

export async function upsertEpic(name: string, key: string) {
  const company = await upsertEpicForCompany((await getCompany()).id, name, key);
  return company.memory;
}

export async function replaceDefinitionOfReady(rows: DorRow[]) {
  const company = await replaceDorForCompany((await getCompany()).id, rows);
  return company.memory;
}
