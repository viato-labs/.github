import { draftToAdf } from "@/lib/templates/ticket-body";
import type { CreateTicketResult, JiraConnectionSecrets, TicketDraft } from "@/lib/types";
import { getCompanySecrets } from "@/lib/workspaces/store";

export type JiraConfig = {
  baseUrl: string;
  email: string;
  apiToken: string;
  dryRun: boolean;
};

/** Fallback env credentials (single-tenant). Prefer per-company secrets. */
export function getEnvJiraConfig(): JiraConfig {
  const baseUrl = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL || "";
  const apiToken = process.env.JIRA_API_TOKEN || "";
  const dryRunEnv = process.env.JIRA_DRY_RUN;
  const hasCreds = Boolean(baseUrl && email && apiToken);
  const live = hasCreds && (dryRunEnv === "false" || dryRunEnv === "0");

  return {
    baseUrl,
    email,
    apiToken,
    dryRun: !live,
  };
}

export async function getJiraConfigForCompany(
  companyIdOrSlug?: string,
): Promise<JiraConfig> {
  const secrets = await getCompanySecrets(companyIdOrSlug);
  if (secrets?.baseUrl && secrets.email && secrets.apiToken) {
    const live = !secrets.dryRun;
    return {
      baseUrl: secrets.baseUrl.replace(/\/$/, ""),
      email: secrets.email,
      apiToken: secrets.apiToken,
      dryRun: !live,
    };
  }
  return getEnvJiraConfig();
}

/** @deprecated use getJiraConfigForCompany */
export function getJiraConfig(): JiraConfig {
  return getEnvJiraConfig();
}

function authHeader(config: JiraConfig): string {
  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  return `Basic ${token}`;
}

export async function jiraRequest<T>(
  config: JiraConfig,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(config),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira ${response.status}: ${body}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function probeJira(config: JiraConfig, companyName?: string) {
  const label = companyName ? `${companyName}: ` : "";
  if (!config.baseUrl || !config.email || !config.apiToken) {
    return {
      ok: false,
      dryRun: true,
      message: `${label}No Jira credentials configured. Dry-run only. Add a company login (API token) to create live tickets.`,
    };
  }

  try {
    const me = await jiraRequest<{ displayName?: string; emailAddress?: string }>(
      config,
      "/rest/api/3/myself",
    );
    return {
      ok: true,
      dryRun: config.dryRun,
      message: config.dryRun
        ? `${label}Connected as ${me.displayName || me.emailAddress}, dry-run enabled.`
        : `${label}Connected as ${me.displayName || me.emailAddress}. Live creates enabled.`,
      user: me,
    };
  } catch (error) {
    return {
      ok: false,
      dryRun: true,
      message: `${label}${error instanceof Error ? error.message : "Jira probe failed"}`,
    };
  }
}

export function buildCreateIssuePayload(draft: TicketDraft) {
  const fields: Record<string, unknown> = {
    project: { key: draft.projectKey },
    summary: draft.summary,
    issuetype: { name: draft.issueType },
    description: draftToAdf(draft),
    labels: draft.labels,
  };

  if (draft.priority) {
    fields.priority = { name: draft.priority };
  }

  if (draft.epicKey) {
    fields.parent = { key: draft.epicKey };
  }

  return { fields };
}

export async function createIssueFromDraft(
  draft: TicketDraft,
  config?: JiraConfig,
): Promise<CreateTicketResult> {
  const resolved = config || (await getJiraConfigForCompany(draft.companyId));
  const { draftToMarkdown } = await import("@/lib/templates/ticket-body");
  const payload = buildCreateIssuePayload(draft);
  const previewMarkdown = draftToMarkdown(draft);
  const warnings = [...draft.missingFields.map((f) => `Missing/weak field: ${f}`)];
  if (draft.confidence < 0.6) {
    warnings.push(
      `Low confidence (${Math.round(draft.confidence * 100)}%). Review before trusting unsupervised create.`,
    );
  }

  if (resolved.dryRun) {
    return {
      dryRun: true,
      companyId: draft.companyId,
      key: `DRY-${Date.now().toString().slice(-6)}`,
      previewMarkdown,
      payload,
      warnings: [
        ...warnings,
        "Dry-run only — no issue was created in Jira for this company login.",
      ],
    };
  }

  const created = await jiraRequest<{ id: string; key: string; self: string }>(
    resolved,
    "/rest/api/3/issue",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return {
    dryRun: false,
    companyId: draft.companyId,
    id: created.id,
    key: created.key,
    self: created.self,
    previewMarkdown,
    payload,
    warnings,
  };
}

export async function createIssuesFromDrafts(
  drafts: TicketDraft[],
  config?: JiraConfig,
): Promise<CreateTicketResult[]> {
  const results: CreateTicketResult[] = [];
  for (const draft of drafts) {
    results.push(await createIssueFromDraft(draft, config));
  }
  return results;
}

export async function harvestDorFromIssue(
  issueKey: string,
  config?: JiraConfig,
  companyIdOrSlug?: string,
) {
  const resolved = config || (await getJiraConfigForCompany(companyIdOrSlug));
  if (!resolved.baseUrl || !resolved.apiToken) {
    throw new Error("Configure this company's Jira credentials before harvesting.");
  }

  const issue = await jiraRequest<{
    key: string;
    fields: { description?: { content?: Array<Record<string, unknown>> } };
  }>(resolved, `/rest/api/3/issue/${issueKey}?fields=description`);

  const content = issue.fields.description?.content || [];
  const tables = content.filter((node) => node.type === "table");
  if (!tables.length) {
    return { issueKey, rows: [], note: "No ADF tables found in description." };
  }

  const table = tables[tables.length - 1] as {
    content?: Array<{
      content?: Array<{
        type?: string;
        content?: Array<{ content?: Array<{ text?: string }> }>;
      }>;
    }>;
  };

  const rows =
    table.content?.slice(1).map((row) => {
      const cells =
        row.content?.map((cell) => {
          const text = cell.content?.[0]?.content?.[0]?.text || "";
          return text.trim();
        }) || [];
      return {
        criterion: cells[0] || "",
        status: (cells[1] as "Yes" | "No" | "Partial" | "N/A") || "No",
        notes: cells[2] || "",
      };
    }) || [];

  return { issueKey, rows, note: `Harvested ${rows.length} rows from ${issueKey}.` };
}

export function secretsFromBody(body: Partial<JiraConnectionSecrets>): JiraConnectionSecrets {
  return {
    baseUrl: body.baseUrl || "",
    email: body.email || "",
    apiToken: body.apiToken || "",
    dryRun: body.dryRun ?? true,
  };
}
