/**
 * Runs inside the Jira tab so fetches use the user's logged-in session cookies.
 * No passwords. No Cursor plugin. Pure Chrome session.
 */

function originBase() {
  return `${location.protocol}//${location.host}`;
}

async function jiraFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${originBase()}${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message =
      data?.errorMessages?.join("; ") ||
      data?.message ||
      data?.error ||
      `Jira HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function wikiToAdf(text) {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return {
    type: "doc",
    version: 1,
    content: paragraphs.map((block) => ({
      type: "paragraph",
      content: [{ type: "text", text: block.replace(/^h2\.\s*/, "") }],
    })),
  };
}

const handlers = {
  async ping() {
    return {
      ok: true,
      host: location.host,
      href: location.href,
      issueKey: location.pathname.match(/\/(?:browse|issues)\/([A-Z][A-Z0-9]+-\d+)/i)?.[1] || null,
    };
  },

  async myself() {
    const me = await jiraFetch("/rest/api/3/myself");
    return {
      accountId: me.accountId,
      displayName: me.displayName,
      emailAddress: me.emailAddress,
      host: location.host,
    };
  },

  async search({ query }) {
    const jql = /[=()]/.test(query)
      ? query
      : `text ~ "${String(query).replace(/"/g, '\\"')}" ORDER BY updated DESC`;
    let data;
    try {
      data = await jiraFetch("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults: 8,
          fields: ["summary", "status", "issuetype", "project"],
        }),
      });
    } catch {
      const params = new URLSearchParams({
        jql,
        maxResults: "8",
        fields: "summary,status,issuetype,project",
      });
      data = await jiraFetch(`/rest/api/3/search?${params.toString()}`);
    }
    const issues = data.issues || data.values || [];
    return {
      issues: issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields?.summary || issue.summary,
        status: issue.fields?.status?.name,
        type: issue.fields?.issuetype?.name,
      })),
    };
  },

  async readIssue({ issueKey }) {
    const key =
      issueKey ||
      location.pathname.match(/\/(?:browse|issues)\/([A-Z][A-Z0-9]+-\d+)/i)?.[1];
    if (!key) throw new Error("No issue key — open an issue or pass one");
    const issue = await jiraFetch(
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,description,issuetype,project,labels`,
    );
    return {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name,
      projectKey: issue.fields.project?.key,
      issueType: issue.fields.issuetype?.name,
      labels: issue.fields.labels || [],
    };
  },

  async createIssue({ draft }) {
    if (!draft?.summary || !draft?.projectKey) {
      throw new Error("Draft needs summary and projectKey");
    }
    const body = {
      fields: {
        project: { key: draft.projectKey },
        summary: draft.summary,
        issuetype: { name: draft.issueType || "Story" },
        description: wikiToAdf(draft.description || ""),
        labels: draft.labels || [],
      },
    };
    const created = await jiraFetch("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      key: created.key,
      id: created.id,
      self: created.self,
      url: `${originBase()}/browse/${created.key}`,
    };
  },

  async listTransitions({ issueKey }) {
    const data = await jiraFetch(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    );
    return {
      transitions: (data.transitions || []).map((t) => ({
        id: t.id,
        name: t.name,
        toStatus: t.to?.name,
      })),
    };
  },

  async searchConfluence({ query }) {
    const cql = `siteSearch ~ "${String(query).replace(/"/g, '\\"')}"`;
    try {
      const data = await jiraFetch(
        `/wiki/rest/api/search?${new URLSearchParams({
          cql,
          limit: "6",
        }).toString()}`,
      );
      const results = data.results || [];
      return {
        pages: results.map((item) => ({
          title: item.title || item.content?.title,
          url: item.url
            ? item.url.startsWith("http")
              ? item.url
              : `${originBase()}/wiki${item.url}`
            : undefined,
        })),
      };
    } catch {
      return { pages: [] };
    }
  },

  async transitionIssue({ issueKey, transitionId, targetStatus }) {
    const listed = await handlers.listTransitions({ issueKey });
    let id = transitionId;
    if (!id && targetStatus) {
      const match = listed.transitions.find(
        (t) =>
          t.toStatus?.toLowerCase() === String(targetStatus).toLowerCase() ||
          t.name?.toLowerCase() === String(targetStatus).toLowerCase(),
      );
      if (!match) {
        throw new Error(
          `No allowed transition to "${targetStatus}". Allowed: ${listed.transitions
            .map((t) => t.toStatus)
            .join(", ")}`,
        );
      }
      id = match.id;
    }
    if (!id) throw new Error("transitionId or targetStatus required");
    await jiraFetch(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        method: "POST",
        body: JSON.stringify({ transition: { id } }),
      },
    );
    return { issueKey, transitionId: id, ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TF_JIRA_CALL") return;
  const handler = handlers[message.method];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown method ${message.method}` });
    return;
  }
  handler(message.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
});
