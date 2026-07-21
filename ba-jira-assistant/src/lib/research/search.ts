import { getJiraConfigForCompany, jiraRequest } from "@/lib/jira/client";
import { adfToPlainText } from "@/lib/research/adf-text";
import type { ResearchHit } from "@/lib/types";

function escapeJqlText(value: string): string {
  return value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

function keywordsFromQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 8);
}

export async function searchJiraIssues(
  companyId: string,
  query: string,
  maxResults = 8,
): Promise<ResearchHit[]> {
  const config = await getJiraConfigForCompany(companyId);
  if (config.mode !== "oauth" && config.mode !== "basic") return [];

  const terms = keywordsFromQuery(query);
  const textClause =
    terms.length > 0
      ? terms.map((term) => `text ~ "${escapeJqlText(term)}"`).join(" OR ")
      : `text ~ "${escapeJqlText(query)}"`;
  const jql = `(${textClause}) ORDER BY updated DESC`;

  type SearchResponse = {
    issues?: Array<{
      key: string;
      self?: string;
      fields?: {
        summary?: string;
        description?: unknown;
        issuetype?: { name?: string };
        labels?: string[];
        updated?: string;
      };
    }>;
  };

  let data: SearchResponse;
  try {
    data = await jiraRequest<SearchResponse>(
      config,
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,description,issuetype,labels,updated`,
    );
  } catch {
    // Fallback for newer search/jql endpoint shapes
    data = await jiraRequest<SearchResponse>(config, `/rest/api/3/search/jql`, {
      method: "POST",
      body: JSON.stringify({
        jql,
        maxResults,
        fields: ["summary", "description", "issuetype", "labels", "updated"],
      }),
    });
  }

  const site = config.baseUrl?.replace(/\/$/, "") || "";
  return (data.issues || []).map((issue) => {
    const summary = issue.fields?.summary || issue.key;
    const snippet = adfToPlainText(issue.fields?.description, 280);
    return {
      kind: "jira" as const,
      id: issue.key,
      title: summary,
      url: site ? `${site}/browse/${issue.key}` : undefined,
      snippet:
        snippet ||
        `${issue.fields?.issuetype?.name || "Issue"} · labels: ${(issue.fields?.labels || []).join(", ") || "none"}`,
      score: overlapScore(query, `${summary} ${snippet}`),
    };
  });
}

export async function searchConfluencePages(
  companyId: string,
  query: string,
  maxResults = 8,
): Promise<ResearchHit[]> {
  const config = await getJiraConfigForCompany(companyId);
  if (config.mode !== "oauth" || !config.accessToken) return [];

  const oauth = await (
    await import("@/lib/workspaces/store")
  ).getCompanyOAuth(companyId);
  const confluenceCloudId = oauth?.confluenceCloudId || config.cloudId;
  if (!confluenceCloudId) return [];

  const terms = keywordsFromQuery(query);
  const cqlText =
    terms.length > 0
      ? terms.map((term) => `text ~ "${escapeJqlText(term)}"`).join(" OR ")
      : `text ~ "${escapeJqlText(query)}"`;
  const cql = `type = page AND (${cqlText}) ORDER BY lastmodified DESC`;

  const url = `https://api.atlassian.com/ex/confluence/${confluenceCloudId}/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${maxResults}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    // Soft-fail: Confluence may be unavailable or scopes not granted yet.
    return [];
  }

  const data = (await response.json()) as {
    results?: Array<{
      content?: { id?: string; title?: string; type?: string };
      title?: string;
      excerpt?: string;
      url?: string;
      resultGlobalContainer?: { title?: string };
    }>;
  };

  const site = (oauth?.siteUrl || config.baseUrl || "").replace(/\/$/, "");
  return (data.results || []).map((result) => {
    const id = result.content?.id || result.title || "page";
    const title = result.content?.title || result.title || "Confluence page";
    const snippet = (result.excerpt || "")
      .replace(/@@@hl@@@|@@@endhl@@@/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    const path = result.url || "";
    return {
      kind: "confluence" as const,
      id: String(id),
      title,
      url: path.startsWith("http")
        ? path
        : site
          ? `${site}/wiki${path.startsWith("/") ? path : `/${path}`}`
          : undefined,
      snippet:
        snippet ||
        `Confluence · ${result.resultGlobalContainer?.title || "space"}`,
      score: overlapScore(query, `${title} ${snippet}`),
    };
  });
}

function overlapScore(query: string, haystack: string): number {
  const terms = keywordsFromQuery(query);
  if (!terms.length) return 0.3;
  const lower = haystack.toLowerCase();
  const hits = terms.filter((term) => lower.includes(term)).length;
  return Number((hits / terms.length).toFixed(2));
}
