/** Built-in company profiles + user-added accounts (chrome.storage). */

export const SEED_ACCOUNTS = [
  {
    id: "christies",
    name: "Christie's",
    slug: "christies",
    hostHints: ["christies", "chr"],
    defaultProjectKey: "BAU",
    defaultEpicKey: "BAU",
    defaultPostCreateStatus: "In Analysis",
    summaryPrefix: "[SCO] ",
    color: "#6554C0",
  },
  {
    id: "mclaren",
    name: "McLaren",
    slug: "mclaren",
    hostHints: ["mclaren", "mcl"],
    defaultProjectKey: "CFG",
    defaultEpicKey: "Configurator",
    defaultPostCreateStatus: "To Do",
    summaryPrefix: "",
    color: "#0B5FFF",
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

export async function loadAccounts() {
  const stored = await chrome.storage.local.get(["accounts", "activeAccountId"]);
  const custom = Array.isArray(stored.accounts) ? stored.accounts : [];
  const byId = new Map();
  for (const account of [...SEED_ACCOUNTS, ...custom]) {
    byId.set(account.id, {
      ...account,
      color: account.color || colorFor(account.slug || account.id),
    });
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

export async function addAccount({ name, hostHint, defaultProjectKey }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Company name is required");
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stored = await chrome.storage.local.get(["accounts"]);
  const custom = Array.isArray(stored.accounts) ? stored.accounts : [];
  if (
    SEED_ACCOUNTS.some((a) => a.id === slug) ||
    custom.some((a) => a.id === slug || a.slug === slug)
  ) {
    throw new Error(`Account already exists: ${trimmed}`);
  }
  const account = {
    id: slug,
    name: trimmed,
    slug,
    hostHints: [hostHint || slug].filter(Boolean),
    defaultProjectKey: (defaultProjectKey || "PROJ").toUpperCase(),
    defaultEpicKey: "",
    defaultPostCreateStatus: "To Do",
    summaryPrefix: "",
    color: colorFor(slug),
    custom: true,
  };
  custom.push(account);
  await chrome.storage.local.set({ accounts: custom, activeAccountId: account.id });
  return loadAccounts();
}

export function matchAccountForHost(accounts, hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    accounts.find((account) =>
      (account.hostHints || []).some((hint) => host.includes(String(hint).toLowerCase())),
    ) || null
  );
}
