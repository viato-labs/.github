import {
  addAccount,
  loadAccounts,
  matchAccountForHost,
  saveAccountUrl,
  setActiveAccount,
} from "./lib/accounts.js";
import { draftsFromGuidance, draftToPastePack } from "./lib/draft.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

async function getActiveJiraTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url) throw new Error("No active tab");
  if (!/atlassian\.net|jira\.com/i.test(tab.url)) {
    throw new Error("Open this company’s Jira tab (logged in), then try again");
  }
  return tab;
}

async function ensureBridge(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "TF_JIRA_CALL", method: "ping" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/jira-bridge.js"],
    });
  }
}

async function callJira(method, payload = {}) {
  const tab = await getActiveJiraTab();
  await ensureBridge(tab.id);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "TF_JIRA_CALL",
    method,
    payload,
  });
  if (!response?.ok) throw new Error(response?.error || "Jira call failed");
  return { tab, data: response.data };
}

async function executeTool(name, params = {}, session = {}) {
  const { accounts, activeAccountId } = await loadAccounts();
  let account = accounts.find(
    (a) => a.id === (session.activeAccountId || activeAccountId),
  );

  switch (name) {
    case "detect_session": {
      try {
        const { tab, data } = await callJira("myself");
        const host = new URL(tab.url).hostname;
        const matched = matchAccountForHost(accounts, host);
        if (matched && matched.id !== activeAccountId) {
          await setActiveAccount(matched.id);
          account = matched;
        }
        if (account && !account.jiraUrl) {
          await saveAccountUrl(account.id, `${new URL(tab.url).origin}`);
          account = (await loadAccounts()).accounts.find((a) => a.id === account.id);
        }
        return {
          message: `Signed in as ${data.displayName} on ${host}${
            account ? ` · ${account.name}` : ""
          }`,
          user: data,
          host,
          account,
        };
      } catch (error) {
        return { message: error.message, account };
      }
    }
    case "open_jira": {
      if (!account?.jiraUrl) {
        throw new Error("Add the Jira URL for this account first");
      }
      await chrome.tabs.create({ url: account.jiraUrl });
      return { message: `Opening ${account.name} Jira… log in if needed, then come back.` };
    }
    case "list_accounts": {
      return {
        message: accounts
          .map((a) => `• ${a.name}${a.jiraUrl ? ` — ${a.jiraUrl}` : " — URL missing"}`)
          .join("\n"),
        accounts,
        activeAccountId,
      };
    }
    case "switch_account": {
      const q = String(params.account || "").toLowerCase().replace(/^to\s+/, "");
      const found = accounts.find(
        (a) =>
          a.id === q ||
          a.slug === q ||
          a.name.toLowerCase() === q ||
          a.name.toLowerCase().includes(q),
      );
      if (!found) throw new Error(`Unknown account: ${params.account}`);
      await setActiveAccount(found.id);
      return { message: `Working in ${found.name}`, account: found };
    }
    case "add_account": {
      const result = await addAccount({
        name: params.name,
        jiraUrl: params.jiraUrl,
        defaultProjectKey: params.projectKey,
      });
      const created = result.accounts.find((a) => a.id === result.activeAccountId);
      return { message: `Added ${created.name}`, account: created, ...result };
    }
    case "save_jira_url": {
      const result = await saveAccountUrl(
        params.accountId || activeAccountId,
        params.jiraUrl,
      );
      const updated = result.accounts.find((a) => a.id === result.activeAccountId);
      return { message: `Saved Jira URL for ${updated.name}`, account: updated, ...result };
    }
    case "search_context": {
      const query = params.query || params.guidance || "";
      let jiraIssues = [];
      let pages = [];
      try {
        const jira = await callJira("search", { query });
        jiraIssues = jira.data.issues || [];
      } catch {
        /* optional if tab not open */
      }
      try {
        const conf = await callJira("searchConfluence", { query });
        pages = conf.data.pages || [];
      } catch {
        /* optional */
      }
      const note = [
        jiraIssues.length ? "Related Jira:" : "",
        ...jiraIssues.map((i) => `- ${i.key}: ${i.summary}`),
        pages.length ? "Related Confluence:" : "",
        ...pages.map((p) => `- ${p.title}${p.url ? ` (${p.url})` : ""}`),
      ]
        .filter(Boolean)
        .join("\n");
      return {
        message: note || "No live context found — open the company Jira tab while logged in.",
        jiraIssues,
        pages,
        researchNote: note,
      };
    }
    case "draft_from_guidance": {
      if (!account) throw new Error("Pick a company account first");
      const guidance = params.guidance || "";
      if (!guidance.trim()) throw new Error("Guidance is empty");
      let researchNote = "";
      try {
        const ctx = await executeTool(
          "search_context",
          { query: guidance.slice(0, 180) },
          session,
        );
        researchNote = ctx.researchNote || "";
      } catch {
        researchNote = "";
      }
      const drafts = draftsFromGuidance({
        guidance,
        links: params.links || [],
        audience: params.audience || "both",
        account,
        researchNote,
      });
      return {
        message: `Drafted ${drafts.length} ticket(s) for ${account.name} in your voice.\n${drafts
          .map((d, i) => `${i + 1}. ${d.summary}`)
          .join("\n")}\n\nSay create confirm when they look right.`,
        drafts,
      };
    }
    case "create_tickets": {
      if (!params.confirm) throw new Error("Pass confirm: true");
      const drafts = params.drafts || session.drafts || [];
      if (!drafts.length) throw new Error("No drafts — research & draft first");
      const created = [];
      for (const draft of drafts) {
        const { data } = await callJira("createIssue", { draft });
        if (draft.postCreateStatus) {
          try {
            await callJira("transitionIssue", {
              issueKey: data.key,
              targetStatus: draft.postCreateStatus,
            });
          } catch {
            /* optional */
          }
        }
        created.push(data);
      }
      return {
        message: `Created ${created.length} ticket(s) as you:\n${created
          .map((c) => `• ${c.key} — ${c.url}`)
          .join("\n")}`,
        issues: created,
      };
    }
    case "copy_paste_pack": {
      const drafts = params.drafts || session.drafts || [];
      const pastePack = drafts.map(draftToPastePack).join("\n\n---\n\n");
      return { message: "Paste pack ready.", pastePack };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TF_EXECUTE_TOOL") {
    executeTool(message.name, message.params || {}, message.session || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }
  if (message?.type === "TF_LOAD_ACCOUNTS") {
    loadAccounts()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }
});
