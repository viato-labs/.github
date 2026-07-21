import { initials } from "../lib/accounts.js";

const accountListEl = document.getElementById("account-list");
const sessionEl = document.getElementById("session");
const outEl = document.getElementById("out");
const jiraUrlEl = document.getElementById("jira-url");
const guidanceEl = document.getElementById("guidance");
const linksEl = document.getElementById("links");
const audienceEl = document.getElementById("audience");
const createBtn = document.getElementById("btn-create");
const addForm = document.getElementById("add-form");

const state = {
  accounts: [],
  activeAccountId: null,
  drafts: [],
  busy: false,
};

function activeAccount() {
  return state.accounts.find((a) => a.id === state.activeAccountId) || null;
}

function push(text, className = "bubble") {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  outEl.prepend(div);
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

async function executeTool(name, params = {}) {
  const response = await sendRuntime({
    type: "TF_EXECUTE_TOOL",
    name,
    params,
    session: {
      activeAccountId: state.activeAccountId,
      drafts: state.drafts,
    },
  });
  if (!response?.ok) throw new Error(response?.error || "Tool failed");
  if (response.data?.drafts) state.drafts = response.data.drafts;
  if (response.data?.accounts) {
    state.accounts = response.data.accounts;
    state.activeAccountId = response.data.activeAccountId;
    renderAccounts();
  }
  if (response.data?.account?.id) {
    state.activeAccountId = response.data.account.id;
  }
  createBtn.disabled = !state.drafts.length;
  return response.data;
}

async function refreshAccounts() {
  const response = await sendRuntime({ type: "TF_LOAD_ACCOUNTS" });
  if (!response?.ok) {
    sessionEl.textContent = response?.error || "Could not load accounts";
    return;
  }
  state.accounts = response.data.accounts;
  state.activeAccountId = response.data.activeAccountId;
  renderAccounts();
  const account = activeAccount();
  jiraUrlEl.value = account?.jiraUrl || "";
}

function renderAccounts() {
  accountListEl.innerHTML = "";
  for (const account of state.accounts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "account";
    btn.dataset.active = String(account.id === state.activeAccountId);
    const active = account.id === state.activeAccountId;
    btn.innerHTML = `<span class="avatar" style="background:${account.color}">${initials(
      account.name,
    )}</span><span class="account-copy"><strong>${account.name}</strong></span><span class="account-chev material-symbols-outlined">${
      active ? "check_circle" : "chevron_right"
    }</span>`;
    btn.addEventListener("click", async () => {
      const result = await executeTool("switch_account", { account: account.id });
      jiraUrlEl.value = result.account?.jiraUrl || "";
      push(result.message);
      await refreshAccounts();
    });
    accountListEl.appendChild(btn);
  }
}

function linkList() {
  return linksEl.value
    .split(/\n|,/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function renderDrafts(drafts) {
  for (const draft of drafts.slice().reverse()) {
    const card = document.createElement("article");
    card.className = "ticket";
    card.innerHTML = `<strong>${draft.summary}</strong><pre></pre>`;
    card.querySelector("pre").textContent = draft.description;
    outEl.prepend(card);
  }
}

document.getElementById("btn-open").addEventListener("click", async () => {
  try {
    push((await executeTool("open_jira")).message);
  } catch (error) {
    push(error.message);
  }
});

document.getElementById("btn-save-url").addEventListener("click", async () => {
  try {
    const result = await executeTool("save_jira_url", {
      accountId: state.activeAccountId,
      jiraUrl: jiraUrlEl.value.trim(),
    });
    push(result.message);
    await refreshAccounts();
  } catch (error) {
    push(error.message);
  }
});

document.getElementById("btn-session").addEventListener("click", async () => {
  try {
    const result = await executeTool("detect_session");
    sessionEl.textContent = result.message;
    push(result.message);
    await refreshAccounts();
  } catch (error) {
    sessionEl.textContent = error.message;
    push(error.message);
  }
});

document.getElementById("btn-draft").addEventListener("click", async () => {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await executeTool("draft_from_guidance", {
      guidance: guidanceEl.value,
      links: linkList(),
      audience: audienceEl.value,
    });
    push(result.message);
    renderDrafts(result.drafts || []);
  } catch (error) {
    push(error.message);
  } finally {
    state.busy = false;
  }
});

document.getElementById("btn-create").addEventListener("click", async () => {
  if (state.busy || !state.drafts.length) return;
  state.busy = true;
  try {
    const result = await executeTool("create_tickets", {
      confirm: true,
      drafts: state.drafts,
    });
    push(result.message);
  } catch (error) {
    push(error.message);
  } finally {
    state.busy = false;
  }
});

document.getElementById("btn-add-toggle").addEventListener("click", () => {
  addForm.classList.toggle("hidden");
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await executeTool("add_account", {
      name: document.getElementById("add-name").value.trim(),
      jiraUrl: document.getElementById("add-url").value.trim(),
    });
    push(result.message);
    addForm.reset();
    addForm.classList.add("hidden");
    await refreshAccounts();
  } catch (error) {
    push(error.message);
  }
});

push(
  "1. Pick a company\n2. Save its Jira URL + Open Jira (log in)\n3. Paste guidance / Figma / docs\n4. Choose Dev, QA, or both\n5. Research & draft → Create in Jira",
);

void refreshAccounts().then(async () => {
  try {
    const result = await executeTool("detect_session");
    sessionEl.textContent = result.message;
  } catch (error) {
    sessionEl.textContent = error.message;
  }
});
