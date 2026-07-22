import {
  fetchOAuthIdentity,
  refreshAccessToken,
  toStoredTokens,
} from "@/lib/jira/oauth";
import { draftToAdf } from "@/lib/templates/ticket-body";
import type {
  AtlassianOAuthTokens,
  CreateTicketResult,
  JiraConnectionSecrets,
  TicketDraft,
  TransitionResult,
  WorkflowTransition,
} from "@/lib/types";
import {
  getCompany,
  getCompanyOAuth,
  getCompanySecrets,
  saveCompanyOAuth,
} from "@/lib/workspaces/store";

export type JiraConfig = {
  mode: "oauth" | "basic" | "none";
  dryRun: boolean;
  accessToken?: string;
  cloudId?: string;
  baseUrl?: string;
  email?: string;
  apiToken?: string;
  accountLabel?: string;
  siteName?: string;
};

function envWantsLive(): boolean {
  const dryRunEnv = process.env.JIRA_DRY_RUN;
  return dryRunEnv === "false" || dryRunEnv === "0";
}

export function getEnvJiraConfig(): JiraConfig {
  const baseUrl = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL || "";
  const apiToken = process.env.JIRA_API_TOKEN || "";
  const hasCreds = Boolean(baseUrl && email && apiToken);
  if (!hasCreds) {
    return { mode: "none", dryRun: true };
  }
  return {
    mode: "basic",
    baseUrl,
    email,
    apiToken,
    dryRun: !envWantsLive(),
  };
}

async function ensureFreshOAuth(
  companyIdOrSlug: string,
  tokens: AtlassianOAuthTokens,
): Promise<AtlassianOAuthTokens> {
  const skewMs = 60_000;
  if (tokens.expiresAt - skewMs > Date.now()) return tokens;
  if (!tokens.refreshToken) {
    throw new Error("OAuth session expired. Sign in with Microsoft again.");
  }

  const refreshed = await refreshAccessToken(tokens.refreshToken);
  const next = toStoredTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresIn: refreshed.expires_in,
    scope: refreshed.scope,
    cloudId: tokens.cloudId,
    confluenceCloudId: tokens.confluenceCloudId,
    siteUrl: tokens.siteUrl,
    siteName: tokens.siteName,
    previous: tokens,
  });
  await saveCompanyOAuth(companyIdOrSlug, next);
  return next;
}

export async function getJiraConfigForCompany(
  companyIdOrSlug?: string,
): Promise<JiraConfig> {
  const company = await getCompany(companyIdOrSlug);
  const oauth = await getCompanyOAuth(company.id);
  if (oauth?.accessToken && oauth.cloudId) {
    const fresh = await ensureFreshOAuth(company.id, oauth);
    return {
      mode: "oauth",
      dryRun: false,
      accessToken: fresh.accessToken,
      cloudId: fresh.cloudId,
      baseUrl: fresh.siteUrl,
      accountLabel: fresh.accountDisplayName || fresh.accountEmail,
      siteName: fresh.siteName,
    };
  }

  const secrets = await getCompanySecrets(company.id);
  if (secrets?.baseUrl && secrets.email && secrets.apiToken) {
    return {
      mode: "basic",
      baseUrl: secrets.baseUrl.replace(/\/$/, ""),
      email: secrets.email,
      apiToken: secrets.apiToken,
      dryRun: secrets.dryRun,
    };
  }
  return getEnvJiraConfig();
}

/** @deprecated use getJiraConfigForCompany */
export function getJiraConfig(): JiraConfig {
  return getEnvJiraConfig();
}

function requestUrl(config: JiraConfig, pathname: string): string {
  if (config.mode === "oauth") {
    if (!config.cloudId) throw new Error("Missing Jira cloudId for OAuth");
    return `https://api.atlassian.com/ex/jira/${config.cloudId}${pathname}`;
  }
  if (!config.baseUrl) throw new Error("Missing Jira base URL");
  return `${config.baseUrl}${pathname}`;
}

function authHeader(config: JiraConfig): string {
  if (config.mode === "oauth") {
    if (!config.accessToken) throw new Error("Missing OAuth access token");
    return `Bearer ${config.accessToken}`;
  }
  if (!config.email || !config.apiToken) {
    throw new Error("Missing basic auth credentials");
  }
  return `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
}

export async function jiraRequest<T>(
  config: JiraConfig,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  if (config.mode === "none") {
    throw new Error("No Jira connection. Sign in with Microsoft first.");
  }

  const response = await fetch(requestUrl(config, pathname), {
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
  if (config.mode === "none") {
    return {
      ok: false,
      dryRun: true,
      connected: false,
      mode: config.mode,
      message: `${label}Not signed in. Use Sign in with Microsoft to let the app create/edit Jira as you.`,
    };
  }

  if (config.dryRun && config.mode === "basic") {
    return {
      ok: true,
      dryRun: true,
      connected: true,
      mode: config.mode,
      message: `${label}API token configured but dry-run is on.`,
    };
  }

  try {
    const me = await jiraRequest<{ displayName?: string; emailAddress?: string }>(
      config,
      "/rest/api/3/myself",
    );
    const who = me.displayName || me.emailAddress || config.accountLabel || "you";
    return {
      ok: true,
      dryRun: config.dryRun,
      connected: true,
      mode: config.mode,
      message:
        config.mode === "oauth"
          ? `${label}Signed in as ${who}${config.siteName ? ` @ ${config.siteName}` : ""}. App can create/edit Jira as you.`
          : `${label}Connected as ${who}. Live creates ${config.dryRun ? "disabled (dry-run)" : "enabled"}.`,
      user: me,
    };
  } catch (error) {
    return {
      ok: false,
      dryRun: true,
      connected: false,
      mode: config.mode,
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

  if (resolved.mode === "none" || resolved.dryRun) {
    return {
      dryRun: true,
      companyId: draft.companyId,
      key: `DRY-${Date.now().toString().slice(-6)}`,
      previewMarkdown,
      payload,
      warnings: [
        ...warnings,
        resolved.mode === "none"
          ? "Not signed in — dry-run only. Sign in with Microsoft to create for real."
          : "Dry-run only — no issue was created in Jira.",
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

export async function updateIssueFromDraft(
  issueKey: string,
  draft: TicketDraft,
  config?: JiraConfig,
) {
  const resolved = config || (await getJiraConfigForCompany(draft.companyId));
  if (resolved.mode === "none" || resolved.dryRun) {
    throw new Error("Sign in with Microsoft before editing Jira issues.");
  }

  const fields: Record<string, unknown> = {
    summary: draft.summary,
    description: draftToAdf(draft),
    labels: draft.labels,
  };
  if (draft.priority) fields.priority = { name: draft.priority };

  await jiraRequest(resolved, `/rest/api/3/issue/${issueKey}`, {
    method: "PUT",
    body: JSON.stringify({ fields }),
  });

  return { key: issueKey, updated: true };
}

function normalizeStatusName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function statusAliases(target: string): string[] {
  const normalized = normalizeStatusName(target);
  const aliases = new Set<string>([normalized]);
  if (normalized === "in analysis" || normalized === "analysis") {
    aliases.add("in analysis");
    aliases.add("analysis");
    aliases.add("under analysis");
  }
  if (normalized === "in review" || normalized === "review") {
    aliases.add("in review");
    aliases.add("review");
    aliases.add("code review");
  }
  if (normalized === "ready for dev" || normalized === "ready for development") {
    aliases.add("ready for dev");
    aliases.add("ready for development");
  }
  return [...aliases];
}

export async function getIssueStatus(
  issueKey: string,
  config: JiraConfig,
): Promise<string | undefined> {
  const issue = await jiraRequest<{
    fields?: { status?: { name?: string } };
  }>(config, `/rest/api/3/issue/${issueKey}?fields=status`);
  return issue.fields?.status?.name;
}

export async function listIssueTransitions(
  issueKey: string,
  config?: JiraConfig,
  companyIdOrSlug?: string,
): Promise<{
  key: string;
  currentStatus?: string;
  transitions: WorkflowTransition[];
}> {
  const resolved = config || (await getJiraConfigForCompany(companyIdOrSlug));
  if (resolved.mode === "none") {
    throw new Error("Sign in with Microsoft before reading workflow transitions.");
  }

  const data = await jiraRequest<{
    transitions?: Array<{
      id: string;
      name: string;
      to?: { id?: string; name?: string };
    }>;
  }>(resolved, `/rest/api/3/issue/${issueKey}/transitions`);

  const currentStatus = await getIssueStatus(issueKey, resolved).catch(
    () => undefined,
  );

  const transitions: WorkflowTransition[] = (data.transitions || []).map(
    (transition) => ({
      id: transition.id,
      name: transition.name,
      toStatus: transition.to?.name || transition.name,
      toStatusId: transition.to?.id,
    }),
  );

  return { key: issueKey, currentStatus, transitions };
}

export async function transitionIssueToStatus(input: {
  issueKey: string;
  targetStatus: string;
  companyId?: string;
  config?: JiraConfig;
  confirm?: boolean;
}): Promise<TransitionResult> {
  const resolved =
    input.config || (await getJiraConfigForCompany(input.companyId));
  const listed = await listIssueTransitions(
    input.issueKey,
    resolved,
    input.companyId,
  );

  const aliases = statusAliases(input.targetStatus);
  const match = listed.transitions.find((transition) => {
    const to = normalizeStatusName(transition.toStatus);
    const name = normalizeStatusName(transition.name);
    return aliases.some(
      (alias) =>
        to === alias ||
        name === alias ||
        to.includes(alias) ||
        name.includes(alias),
    );
  });

  if (!match) {
    return {
      key: input.issueKey,
      dryRun: true,
      fromStatus: listed.currentStatus,
      toStatus: input.targetStatus,
      availableTransitions: listed.transitions,
      message: `No valid transition to "${input.targetStatus}" from ${listed.currentStatus || "current status"}. Available: ${
        listed.transitions.map((t) => t.toStatus).join(", ") || "none"
      }.`,
    };
  }

  if (resolved.mode === "none" || resolved.dryRun) {
    return {
      key: input.issueKey,
      dryRun: true,
      fromStatus: listed.currentStatus,
      toStatus: match.toStatus,
      transitionId: match.id,
      transitionName: match.name,
      availableTransitions: listed.transitions,
      message: `Dry-run: would transition ${input.issueKey} via "${match.name}" to ${match.toStatus}.`,
    };
  }

  if (!input.confirm) {
    return {
      key: input.issueKey,
      dryRun: true,
      fromStatus: listed.currentStatus,
      toStatus: match.toStatus,
      transitionId: match.id,
      transitionName: match.name,
      availableTransitions: listed.transitions,
      message: `Ready to transition ${input.issueKey} via "${match.name}" to ${match.toStatus}. Confirm to apply.`,
    };
  }

  await jiraRequest(resolved, `/rest/api/3/issue/${input.issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({
      transition: { id: match.id },
    }),
  });

  return {
    key: input.issueKey,
    dryRun: false,
    fromStatus: listed.currentStatus,
    toStatus: match.toStatus,
    transitionId: match.id,
    transitionName: match.name,
    availableTransitions: listed.transitions,
    message: `Moved ${input.issueKey} from ${listed.currentStatus || "previous status"} to ${match.toStatus}.`,
  };
}

export async function harvestDorFromIssue(
  issueKey: string,
  config?: JiraConfig,
  companyIdOrSlug?: string,
) {
  const resolved = config || (await getJiraConfigForCompany(companyIdOrSlug));
  if (resolved.mode === "none") {
    throw new Error("Sign in with Microsoft before harvesting a golden ticket.");
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

export async function verifyOAuthSession(tokens: AtlassianOAuthTokens) {
  return fetchOAuthIdentity(tokens.accessToken, tokens.cloudId);
}
