import { promises as fs } from "fs";
import path from "path";
import type {
  AtlassianOAuthTokens,
  CompanySummary,
  CompanyWorkspace,
  ContextMemory,
  DorRow,
  JiraConnectionPublic,
  JiraConnectionSecrets,
} from "@/lib/types";
import { DEFAULT_SEEDS, seedBlankCompany } from "@/lib/workspaces/seeds";

const DATA_DIR = path.join(process.cwd(), ".data");
const WORKSPACES_DIR = path.join(DATA_DIR, "workspaces");
const INDEX_PATH = path.join(WORKSPACES_DIR, "index.json");
const LEGACY_MEMORY_PATH = path.join(DATA_DIR, "context-memory.json");

type WorkspaceIndex = {
  activeCompanyId: string;
  companies: Array<{ id: string; slug: string; name: string }>;
};

function workspaceDir(slug: string) {
  return path.join(WORKSPACES_DIR, slug);
}

function memoryPath(slug: string) {
  return path.join(workspaceDir(slug), "memory.json");
}

function metaPath(slug: string) {
  return path.join(workspaceDir(slug), "meta.json");
}

function secretsPath(slug: string) {
  return path.join(workspaceDir(slug), "secrets.json");
}

function oauthPath(slug: string) {
  return path.join(workspaceDir(slug), "oauth.json");
}

function oauthStatePath() {
  return path.join(WORKSPACES_DIR, "oauth-state.json");
}

async function ensureDirs() {
  await fs.mkdir(WORKSPACES_DIR, { recursive: true });
}

function toSummary(company: CompanyWorkspace): CompanySummary {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    boards: company.boards,
    playbooks: company.playbooks,
    workflow: company.workflow || {
      commonStatuses: ["To Do", "In Progress", "In Review", "Done"],
      enablePostCreateTransition: false,
    },
    connection: company.connection,
    memoryStats: {
      briefs: company.memory.briefs.length,
      createdTickets: company.memory.createdTickets.length,
      historicalTickets: company.memory.historicalTickets.length,
      confluencePages: company.memory.confluencePages?.length || 0,
      epics: Object.keys(company.memory.epicMap).length,
      glossaryTerms: Object.keys(company.memory.productGlossary).length,
      sections: company.memory.sections.length,
    },
  };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function loadSecrets(slug: string): Promise<JiraConnectionSecrets | null> {
  return readJson<JiraConnectionSecrets>(secretsPath(slug));
}

async function loadOAuth(slug: string): Promise<AtlassianOAuthTokens | null> {
  return readJson<AtlassianOAuthTokens>(oauthPath(slug));
}

function publicConnection(
  secrets: JiraConnectionSecrets | null,
  oauth: AtlassianOAuthTokens | null,
  fallback?: JiraConnectionPublic,
): JiraConnectionPublic {
  const oauthConnected = Boolean(oauth?.accessToken && oauth?.cloudId);
  if (!secrets && !oauthConnected) {
    return (
      fallback || {
        baseUrl: "",
        email: "",
        tokenConfigured: false,
        oauthConnected: false,
        dryRun: true,
      }
    );
  }
  return {
    baseUrl: oauth?.siteUrl || secrets?.baseUrl || "",
    email: oauth?.accountEmail || secrets?.email || "",
    tokenConfigured: Boolean(secrets?.apiToken),
    oauthConnected,
    oauthAccountName: oauth?.accountDisplayName || oauth?.accountEmail,
    oauthSiteName: oauth?.siteName,
    // Live when OAuth is connected (Path B). API-token dryRun remains respected if only token exists.
    dryRun: oauthConnected ? false : secrets ? secrets.dryRun || !secrets.apiToken : true,
  };
}

async function persistCompany(company: CompanyWorkspace) {
  company.updatedAt = new Date().toISOString();
  company.memory.updatedAt = company.updatedAt;
  const { memory, ...meta } = company;
  await writeJson(metaPath(company.slug), meta);
  await writeJson(memoryPath(company.slug), memory);
}

async function readCompany(slug: string): Promise<CompanyWorkspace | null> {
  const meta = await readJson<Omit<CompanyWorkspace, "memory">>(metaPath(slug));
  const memory = await readJson<ContextMemory>(memoryPath(slug));
  if (!meta || !memory) return null;
  if (!memory.confluencePages) memory.confluencePages = [];
  if (!memory.researchQueries) memory.researchQueries = [];
  if (!memory.historicalTickets) memory.historicalTickets = [];
  const secrets = await loadSecrets(slug);
  const oauth = await loadOAuth(slug);
  const workflow =
    meta.workflow ||
    (slug === "christies"
      ? {
          defaultPostCreateStatus: "In Analysis",
          commonStatuses: [
            "In Analysis",
            "To Do",
            "Ready for Dev",
            "In Progress",
            "In Review",
            "Done",
          ],
          enablePostCreateTransition: true,
        }
      : {
          commonStatuses: ["To Do", "In Progress", "In Review", "Done"],
          enablePostCreateTransition: false,
        });
  return {
    ...meta,
    workflow,
    memory,
    connection: publicConnection(secrets, oauth, meta.connection),
  };
}

async function bootstrapIfNeeded() {
  await ensureDirs();
  const index = await readJson<WorkspaceIndex>(INDEX_PATH);
  if (index?.companies?.length) return index;

  // Migrate legacy single-memory file into Christie's if present.
  const legacy = await readJson<ContextMemory>(LEGACY_MEMORY_PATH);
  const seeds = DEFAULT_SEEDS.map((seed) => {
    if (legacy && seed.slug === "christies") {
      return {
        ...seed,
        memory: {
          ...seed.memory,
          ...legacy,
          sections: seed.memory.sections,
          historicalTickets:
            legacy.historicalTickets || seed.memory.historicalTickets,
        },
      };
    }
    return seed;
  });

  for (const company of seeds) {
    await persistCompany(company);
  }

  const nextIndex: WorkspaceIndex = {
    activeCompanyId: seeds[0].id,
    companies: seeds.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
  };
  await writeJson(INDEX_PATH, nextIndex);
  return nextIndex;
}

export async function listCompanies(): Promise<CompanySummary[]> {
  const index = await bootstrapIfNeeded();
  const companies: CompanySummary[] = [];
  for (const entry of index.companies) {
    const company = await readCompany(entry.slug);
    if (company) companies.push(toSummary(company));
  }
  return companies;
}

export async function getActiveCompanyId(): Promise<string> {
  const index = await bootstrapIfNeeded();
  return index.activeCompanyId;
}

export async function setActiveCompany(companyId: string) {
  const index = await bootstrapIfNeeded();
  const found = index.companies.find((c) => c.id === companyId || c.slug === companyId);
  if (!found) throw new Error(`Unknown company: ${companyId}`);
  index.activeCompanyId = found.id;
  await writeJson(INDEX_PATH, index);
  return found;
}

export async function getCompany(companyIdOrSlug?: string): Promise<CompanyWorkspace> {
  const index = await bootstrapIfNeeded();
  const target =
    companyIdOrSlug ||
    index.companies.find((c) => c.id === index.activeCompanyId)?.slug ||
    index.companies[0]?.slug;

  const entry = index.companies.find(
    (c) => c.id === target || c.slug === target,
  );
  if (!entry) throw new Error("No company workspace found");

  const company = await readCompany(entry.slug);
  if (!company) throw new Error(`Company data missing for ${entry.slug}`);
  return company;
}

export async function createCompany(name: string, slug?: string) {
  const index = await bootstrapIfNeeded();
  const normalized =
    slug ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  if (index.companies.some((c) => c.slug === normalized)) {
    throw new Error(`Company slug already exists: ${normalized}`);
  }

  const company = seedBlankCompany(name, normalized);
  await persistCompany(company);
  index.companies.push({
    id: company.id,
    slug: company.slug,
    name: company.name,
  });
  await writeJson(INDEX_PATH, index);
  return toSummary(company);
}

export async function saveCompanyMemory(
  companyIdOrSlug: string,
  memory: ContextMemory,
) {
  const company = await getCompany(companyIdOrSlug);
  company.memory = memory;
  await persistCompany(company);
  return company;
}

export async function updateCompanyMeta(
  companyIdOrSlug: string,
  patch: Partial<
    Pick<CompanyWorkspace, "name" | "boards" | "playbooks" | "workflow">
  >,
) {
  const company = await getCompany(companyIdOrSlug);
  if (patch.name) company.name = patch.name;
  if (patch.boards) company.boards = patch.boards;
  if (patch.playbooks) company.playbooks = patch.playbooks;
  if (patch.workflow) company.workflow = patch.workflow;
  await persistCompany(company);
  return toSummary(company);
}

export async function saveCompanySecrets(
  companyIdOrSlug: string,
  secrets: JiraConnectionSecrets,
) {
  const company = await getCompany(companyIdOrSlug);
  const normalized: JiraConnectionSecrets = {
    baseUrl: secrets.baseUrl.replace(/\/$/, ""),
    email: secrets.email,
    apiToken: secrets.apiToken,
    dryRun: secrets.dryRun,
  };
  await writeJson(secretsPath(company.slug), normalized);
  const oauth = await loadOAuth(company.slug);
  company.connection = publicConnection(normalized, oauth);
  await persistCompany(company);
  return toSummary(company);
}

export async function getCompanySecrets(
  companyIdOrSlug?: string,
): Promise<JiraConnectionSecrets | null> {
  const company = await getCompany(companyIdOrSlug);
  return loadSecrets(company.slug);
}

export async function getCompanyOAuth(
  companyIdOrSlug?: string,
): Promise<AtlassianOAuthTokens | null> {
  const company = await getCompany(companyIdOrSlug);
  return loadOAuth(company.slug);
}

export async function saveCompanyOAuth(
  companyIdOrSlug: string,
  tokens: AtlassianOAuthTokens,
) {
  const company = await getCompany(companyIdOrSlug);
  await writeJson(oauthPath(company.slug), tokens);
  const secrets = await loadSecrets(company.slug);
  company.connection = publicConnection(secrets, tokens);
  await persistCompany(company);
  return toSummary(company);
}

export async function clearCompanyOAuth(companyIdOrSlug: string) {
  const company = await getCompany(companyIdOrSlug);
  try {
    await fs.unlink(oauthPath(company.slug));
  } catch {
    // ignore missing file
  }
  const secrets = await loadSecrets(company.slug);
  company.connection = publicConnection(secrets, null);
  await persistCompany(company);
  return toSummary(company);
}

export async function saveOAuthNonce(nonceHash: string, companyId: string) {
  await ensureDirs();
  const current =
    (await readJson<Record<string, { companyId: string; createdAt: number }>>(
      oauthStatePath(),
    )) || {};
  const now = Date.now();
  for (const [key, value] of Object.entries(current)) {
    if (now - value.createdAt > 15 * 60 * 1000) delete current[key];
  }
  current[nonceHash] = { companyId, createdAt: now };
  await writeJson(oauthStatePath(), current);
}

export async function consumeOAuthNonce(
  nonceHash: string,
): Promise<string | null> {
  const current =
    (await readJson<Record<string, { companyId: string; createdAt: number }>>(
      oauthStatePath(),
    )) || {};
  const entry = current[nonceHash];
  if (!entry) return null;
  delete current[nonceHash];
  await writeJson(oauthStatePath(), current);
  if (Date.now() - entry.createdAt > 15 * 60 * 1000) return null;
  return entry.companyId;
}

export async function rememberBrief(
  companyIdOrSlug: string,
  text: string,
  files: string[] = [],
) {
  const company = await getCompany(companyIdOrSlug);
  company.memory.briefs.unshift({
    id: `brief_${Date.now()}`,
    createdAt: new Date().toISOString(),
    text,
    files,
  });
  company.memory.briefs = company.memory.briefs.slice(0, 200);
  await persistCompany(company);
  return company;
}

export async function rememberCreatedTicket(
  companyIdOrSlug: string,
  input: {
    key: string;
    summary: string;
    dryRun: boolean;
    playbookId?: string;
  },
) {
  const company = await getCompany(companyIdOrSlug);
  company.memory.createdTickets.unshift({
    ...input,
    createdAt: new Date().toISOString(),
  });
  company.memory.createdTickets = company.memory.createdTickets.slice(0, 500);
  await persistCompany(company);
  return company;
}

export async function upsertEpic(
  companyIdOrSlug: string,
  name: string,
  key: string,
) {
  const company = await getCompany(companyIdOrSlug);
  company.memory.epicMap[name] = key;
  await persistCompany(company);
  return company;
}

export async function replaceDefinitionOfReady(
  companyIdOrSlug: string,
  rows: DorRow[],
) {
  const company = await getCompany(companyIdOrSlug);
  company.memory.definitionOfReady = rows;
  await persistCompany(company);
  return company;
}

export async function addHistoricalReference(
  companyIdOrSlug: string,
  ref: ContextMemory["historicalTickets"][number],
) {
  const company = await getCompany(companyIdOrSlug);
  company.memory.historicalTickets.unshift(ref);
  company.memory.historicalTickets = company.memory.historicalTickets.slice(0, 300);
  await persistCompany(company);
  return company;
}
