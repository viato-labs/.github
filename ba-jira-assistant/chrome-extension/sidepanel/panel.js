import { runAgentTurn } from "../lib/agent.js";
import { initials } from "../lib/accounts.js";
import { toolHelp } from "../lib/tools.js";

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const accountListEl = document.getElementById("account-list");
const sessionLineEl = document.getElementById("session-line");
const addForm = document.getElementById("add-form");

const state = {
  accounts: [],
  activeAccountId: null,
  draft: null,
  busy: false,
};

function activeAccount() {
  return state.accounts.find((a) => a.id === state.activeAccountId) || null;
}

function pushBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function sendRuntime(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

async function refreshAccounts() {
  const response = await sendRuntime({ type: "TF_LOAD_ACCOUNTS" });
  if (!response?.ok) {
    sessionLineEl.textContent = response?.error || "Could not load accounts";
    return;
  }
  state.accounts = response.data.accounts;
  state.activeAccountId = response.data.activeAccountId;
  renderAccounts();
}

function renderAccounts() {
  accountListEl.innerHTML = "";
  for (const account of state.accounts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "account";
    btn.dataset.active = String(account.id === state.activeAccountId);
    btn.innerHTML = `<span class="avatar" style="background:${account.color}">${initials(
      account.name,
    )}</span><span>${account.name}</span>`;
    btn.addEventListener("click", async () => {
      const result = await executeTool("switch_account", { account: account.id });
      pushBubble("assistant", result.message);
      await refreshAccounts();
    });
    accountListEl.appendChild(btn);
  }
}

async function executeTool(name, params = {}) {
  const response = await sendRuntime({
    type: "TF_EXECUTE_TOOL",
    name,
    params,
    session: {
      activeAccountId: state.activeAccountId,
      draft: state.draft,
    },
  });
  if (!response?.ok) throw new Error(response?.error || "Tool failed");
  if (response.data?.draft) state.draft = response.data.draft;
  if (response.data?.account?.id) state.activeAccountId = response.data.account.id;
  if (response.data?.accounts) {
    state.accounts = response.data.accounts;
    state.activeAccountId = response.data.activeAccountId || state.activeAccountId;
    renderAccounts();
  }
  if (response.data?.pastePack) {
    try {
      await navigator.clipboard.writeText(response.data.pastePack);
      response.data.message = `${response.data.message}\n(Copied to clipboard)`;
    } catch {
      /* ignore */
    }
  }
  return response.data;
}

async function handleSend(text) {
  if (!text || state.busy) return;
  state.busy = true;
  pushBubble("user", text);
  inputEl.value = "";
  try {
    const result = await runAgentTurn({
      text,
      context: {
        account: activeAccount(),
        draft: state.draft,
      },
      executeTool,
    });
    if (result.draft) state.draft = result.draft;
    if (result.pastePack) {
      try {
        await navigator.clipboard.writeText(result.pastePack);
        pushBubble("assistant", `${result.reply}\n(Copied to clipboard)`);
      } catch {
        pushBubble("assistant", result.reply);
      }
    } else {
      pushBubble("assistant", result.reply);
    }
    await refreshAccounts();
  } catch (error) {
    pushBubble("assistant", error instanceof Error ? error.message : String(error));
  } finally {
    state.busy = false;
  }
}

document.getElementById("composer").addEventListener("submit", (event) => {
  event.preventDefault();
  void handleSend(inputEl.value.trim());
});

document.getElementById("btn-tools").addEventListener("click", () => {
  pushBubble("assistant", "Tools I can run in Chrome (no Cursor needed):\n" + toolHelp());
});

document.getElementById("btn-session").addEventListener("click", async () => {
  try {
    const result = await executeTool("detect_session");
    sessionLineEl.textContent = result.message;
    pushBubble("assistant", result.message);
    await refreshAccounts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sessionLineEl.textContent = message;
    pushBubble("assistant", message);
  }
});

document.getElementById("btn-create").addEventListener("click", () => {
  inputEl.focus();
  inputEl.placeholder = "Paste your brief, then press Send…";
  pushBubble(
    "assistant",
    `Creating for **${activeAccount()?.name || "current account"}**. Paste a short brief and I’ll draft it. Say create confirm when ready.`,
  );
});

document.getElementById("btn-add").addEventListener("click", () => {
  addForm.classList.toggle("hidden");
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("add-name").value.trim();
  const projectKey = document.getElementById("add-project").value.trim();
  try {
    const result = await executeTool("add_account", { name, projectKey });
    pushBubble("assistant", result.message);
    addForm.reset();
    addForm.classList.add("hidden");
    await refreshAccounts();
  } catch (error) {
    pushBubble("assistant", error instanceof Error ? error.message : String(error));
  }
});

pushBubble(
  "assistant",
  "I’m a Chrome agent — not a Cursor plugin.\n\n1. Log into Christie's or McLaren Jira in this browser\n2. Pick the account on the left (or + Add)\n3. Paste a brief, or click Check login\n\nI create/search/move tickets using your existing session.",
);

void refreshAccounts().then(async () => {
  try {
    const result = await executeTool("detect_session");
    sessionLineEl.textContent = result.message;
  } catch (error) {
    sessionLineEl.textContent =
      error instanceof Error ? error.message : "Open a logged-in Jira tab";
  }
});
