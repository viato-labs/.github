import { draftToAdf } from "@/lib/templates/ticket-body";
import type { CreateTicketResult, TicketDraft } from "@/lib/types";

export type JiraConfig = {
  baseUrl: string;
  email: string;
  apiToken: string;
  dryRun: boolean;
};

export function getJiraConfig(): JiraConfig {
  const baseUrl = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL || "";
  const apiToken = process.env.JIRA_API_TOKEN || "";
  const dryRunEnv = process.env.JIRA_DRY_RUN;
  const hasCreds = Boolean(baseUrl && email && apiToken);
  // Live creates only when credentials exist AND dry-run is explicitly disabled.
  const live = hasCreds && (dryRunEnv === "false" || dryRunEnv === "0");

  return {
    baseUrl,
    email,
    apiToken,
    dryRun: !live,
  };
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

export async function probeJira(config: JiraConfig) {
  if (!config.baseUrl || !config.email || !config.apiToken) {
    return {
      ok: false,
      dryRun: true,
      message:
        "No Jira credentials configured. Running in dry-run mode. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN and JIRA_DRY_RUN=false for live creates.",
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
        ? `Connected as ${me.displayName || me.emailAddress}, but dry-run is enabled.`
        : `Connected as ${me.displayName || me.emailAddress}. Live creates enabled.`,
      user: me,
    };
  } catch (error) {
    return {
      ok: false,
      dryRun: true,
      message: error instanceof Error ? error.message : "Jira probe failed",
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

  // Team-managed / next-gen style parent link. Company-managed Epic Link
  // customfield IDs vary — calibrate after reading createmeta.
  if (draft.epicKey) {
    fields.parent = { key: draft.epicKey };
  }

  return { fields };
}

export async function createIssueFromDraft(
  draft: TicketDraft,
  config = getJiraConfig(),
): Promise<CreateTicketResult> {
  const { draftToMarkdown } = await import("@/lib/templates/ticket-body");
  const payload = buildCreateIssuePayload(draft);
  const previewMarkdown = draftToMarkdown(draft);
  const warnings = [...draft.missingFields.map((f) => `Missing/weak field: ${f}`)];

  if (config.dryRun) {
    return {
      dryRun: true,
      key: `DRY-${Date.now().toString().slice(-6)}`,
      previewMarkdown,
      payload,
      warnings: [
        ...warnings,
        "Dry-run only — no issue was created in Jira. Set credentials and JIRA_DRY_RUN=false to create for real.",
      ],
    };
  }

  const created = await jiraRequest<{ id: string; key: string; self: string }>(
    config,
    "/rest/api/3/issue",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return {
    dryRun: false,
    id: created.id,
    key: created.key,
    self: created.self,
    previewMarkdown,
    payload,
    warnings,
  };
}

/** Best-effort harvest of a DoR-looking table from a golden ticket description ADF. */
export async function harvestDorFromIssue(issueKey: string, config = getJiraConfig()) {
  if (config.dryRun && (!config.baseUrl || !config.apiToken)) {
    throw new Error("Configure Jira credentials before harvesting a golden ticket.");
  }

  const issue = await jiraRequest<{
    key: string;
    fields: { description?: { content?: Array<Record<string, unknown>> } };
  }>(config, `/rest/api/3/issue/${issueKey}?fields=description`);

  const content = issue.fields.description?.content || [];
  const tables = content.filter((node) => node.type === "table");
  if (!tables.length) {
    return { issueKey, rows: [], note: "No ADF tables found in description." };
  }

  // Prefer the last table — DoR is commonly pasted at the bottom.
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
