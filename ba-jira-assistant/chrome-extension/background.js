import {
  addAccount,
  loadAccounts,
  matchAccountForHost,
  setActiveAccount,
} from "./lib/accounts.js";
import { draftFromBrief, draftToPastePack } from "./lib/draft.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

async function getActiveJiraTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error("No active tab");
  const ok =
    /https:\/\/[^/]+\.(atlassian\.net|jira\.com)\//i.test(tab.url) ||
    /atlassian\.net/i.test(tab.url);
  if (!ok) {
    throw new Error("Open your company Jira tab in Chrome first (*.atlassian.net)");
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
  let account = accounts.find((a) => a.id === (session.activeAccountId || activeAccountId));

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
        return {
          message: `Signed in as ${data.displayName} on ${host}${
            account ? ` · account ${account.name}` : ""
          }`,
          user: data,
          host,
          account,
        };
      } catch (error) {
        return { message: error.message, account };
      }
    }
    case "list_accounts": {
      return {
        message: accounts.map((a) => `• ${a.name} (${a.defaultProjectKey})`).join("\n"),
        accounts,
        activeAccountId,
      };
    }
    case "switch_account": {
      const q = String(params.account || "").toLowerCase();
      const found = accounts.find(
        (a) =>
          a.id === q ||
          a.slug === q ||
          a.name.toLowerCase() === q ||
          a.name.toLowerCase().includes(q.replace(/^to\s+/, "")),
      );
      if (!found) throw new Error(`Unknown account: ${params.account}`);
      await setActiveAccount(found.id);
      return { message: `Switched to ${found.name}`, account: found };
    }
    case "add_account": {
      const result = await addAccount({
        name: params.name,
        defaultProjectKey: params.projectKey,
        hostHint: params.hostHint,
      });
      const created = result.accounts.find((a) => a.id === result.activeAccountId);
      return { message: `Added account ${created.name}`, account: created, ...result };
    }
    case "draft_ticket": {
      if (!account) throw new Error("Pick a company account first");
      const draft = draftFromBrief(params.brief, account);
      return {
        message: `Drafted for ${account.name}:\n• ${draft.summary}\n• ${draft.projectKey} / ${draft.issueType}\nSay **create confirm** to publish with your Chrome login.`,
        draft,
      };
    }
    case "create_ticket": {
      if (!params.confirm) throw new Error("Pass confirm: true to create");
      const draft = params.draft || session.draft;
      if (!draft) throw new Error("No draft to create — draft a brief first");
      const { data } = await callJira("createIssue", { draft });
      let transitionNote = "";
      if (draft.postCreateStatus) {
        try {
          await callJira("transitionIssue", {
            issueKey: data.key,
            targetStatus: draft.postCreateStatus,
          });
          transitionNote = ` Moved toward ${draft.postCreateStatus}.`;
        } catch (error) {
          transitionNote = ` (status move skipped: ${error.message})`;
        }
      }
      return {
        message: `Created ${data.key} as you.${transitionNote}\n${data.url}`,
        issue: data,
      };
    }
    case "search_jira": {
      const { data } = await callJira("search", { query: params.query });
      if (!data.issues?.length) return { message: "No issues found.", issues: [] };
      return {
        message: data.issues
          .map((i) => `• ${i.key}: ${i.summary}${i.status ? ` [${i.status}]` : ""}`)
          .join("\n"),
        issues: data.issues,
      };
    }
    case "read_issue": {
      const { data } = await callJira("readIssue", { issueKey: params.issueKey });
      return {
        message: `${data.key}: ${data.summary}\nStatus: ${data.status} · ${data.projectKey} / ${data.issueType}`,
        issue: data,
      };
    }
    case "list_transitions": {
      const { data } = await callJira("listTransitions", {
        issueKey: params.issueKey,
      });
      return {
        message: data.transitions.length
          ? `Allowed moves for ${params.issueKey}:\n` +
            data.transitions.map((t) => `• ${t.name} → ${t.toStatus}`).join("\n")
          : `No transitions available for ${params.issueKey}`,
        transitions: data.transitions,
      };
    }
    case "move_status": {
      if (!params.confirm) throw new Error("Pass confirm: true to move status");
      await callJira("transitionIssue", {
        issueKey: params.issueKey,
        targetStatus: params.status,
      });
      return {
        message: `Moved ${params.issueKey} toward ${params.status}`,
      };
    }
    case "copy_paste_pack": {
      const draft = params.draft || session.draft;
      if (!draft) throw new Error("No draft");
      const pastePack = draftToPastePack(draft);
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
