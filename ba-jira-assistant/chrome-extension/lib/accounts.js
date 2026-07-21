/** Company accounts with Jira URLs the BA logs into. */

export const SEED_ACCOUNTS = [
  {
    id: "christies",
    name: "Christie's",
    slug: "christies",
    jiraUrl: "https://christiestech.atlassian.net",
    hostHints: ["christiestech", "christies", "chr"],
    defaultProjectKey: "ENGS",
    defaultEpicKey: "BAU",
    defaultPostCreateStatus: "In Analysis",
    summaryPrefix: "",
    color: "#6554C0",
    referenceTicket: "ENGS-19826",
  },
  {
    id: "mclaren",
    name: "McLaren",
    slug: "mclaren",
    jiraUrl: "https://jira.task.mclaren.com",
    hostHints: ["jira.task.mclaren.com", "mclaren", "mcl", "task.mclaren"],
    defaultProjectKey: "DVC",
    defaultEpicKey: "Configurator",
    defaultPostCreateStatus: "To Do",
    summaryPrefix: "",
    color: "#0B5FFF",
    referenceTicket: "DVC-1128",
  },
];

const COLORS = ["#6554C0", "#0B5FFF", "#00875A", "#FF5630", "#00A3BF", "#FF8B00"];

export function initials(name) {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function colorFor(slug) {
  let hash = 0;
  const s = String(slug || "x");
  for (let i = 0; i < s.length; i += 1) hash = (hash + s.charCodeAt(i) * 17) % 997;
  return COLORS[hash % COLORS.length];
}

function hostFromUrl(jiraUrl) {
  try {
    return new URL(jiraUrl).hostname;
  } catch {
    return "";
  }
}

export async function loadAccounts() {
  const stored = await chrome.storage.local.get(["accounts", "activeAccountId"]);
  const custom = Array.isArray(stored.accounts) ? stored.accounts : [];
  const byId = new Map();
  for (const account of [...SEED_ACCOUNTS, ...custom]) {
    const merged = {
      ...account,
      color: account.color || colorFor(account.slug || account.id),
      jiraUrl: account.jiraUrl || "",
    };
    // Prefer custom overrides for seed ids, but keep seed Jira URL if custom is empty
    const existingCustom = custom.find((c) => c.id === merged.id);
    byId.set(
      merged.id,
      existingCustom
        ? {
            ...merged,
            ...existingCustom,
            color: existingCustom.color || merged.color,
            jiraUrl: existingCustom.jiraUrl || merged.jiraUrl || "",
            hostHints: existingCustom.hostHints?.length
              ? existingCustom.hostHints
              : merged.hostHints,
          }
        : merged,
    );
  }
  // Re-add custom-only
  for (const account of custom) {
    if (!byId.has(account.id)) {
      byId.set(account.id, {
        ...account,
        color: account.color || colorFor(account.slug || account.id),
      });
    }
  }
  const accounts = [...byId.values()];
  const activeAccountId =
    stored.activeAccountId && byId.has(stored.activeAccountId)
      ? stored.activeAccountId
      : accounts[0]?.id || null;
  return { accounts, activeAccountId };
}

export async function setActiveAccount(accountId) {
  await chrome.storage.local.set({ activeAccountId: accountId });
  return loadAccounts();
}

export async function upsertAccount(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Company name is required");
  const jiraUrl = String(input.jiraUrl || "").trim().replace(/\/$/, "");
  const slug =
    input.id ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const host = hostFromUrl(jiraUrl);
  const stored = await chrome.storage.local.get(["accounts"]);
  const custom = Array.isArray(stored.accounts) ? stored.accounts : [];
  const next = {
    id: slug,
    name,
    slug,
    jiraUrl,
    hostHints: [host.split(".")[0], slug].filter(Boolean),
    defaultProjectKey: (input.defaultProjectKey || "PROJ").toUpperCase(),
    defaultEpicKey: input.defaultEpicKey || "",
    defaultPostCreateStatus: input.defaultPostCreateStatus || "To Do",
    summaryPrefix: input.summaryPrefix || "",
    color: colorFor(slug),
    custom: true,
  };
  const idx = custom.findIndex((a) => a.id === slug);
  if (idx >= 0) custom[idx] = { ...custom[idx], ...next };
  else custom.push(next);
  await chrome.storage.local.set({ accounts: custom, activeAccountId: slug });
  return loadAccounts();
}

export async function addAccount(input) {
  return upsertAccount(input);
}

export async function saveAccountUrl(accountId, jiraUrl) {
  const { accounts } = await loadAccounts();
  const current = accounts.find((a) => a.id === accountId);
  if (!current) throw new Error("Account not found");
  return upsertAccount({ ...current, jiraUrl });
}

export function matchAccountForHost(accounts, hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    accounts.find((account) => {
      if (account.jiraUrl && hostFromUrl(account.jiraUrl).toLowerCase() === host) {
        return true;
      }
      return (account.hostHints || []).some((hint) =>
        host.includes(String(hint).toLowerCase()),
      );
    }) || null
  );
}
