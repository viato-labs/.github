"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompanySummary, ResearchBundle, TicketDraft } from "@/lib/types";
import type { TicketAudience } from "@/lib/guidance/draft";

type AuthStatus = {
  message: string;
  oauthAppConfigured?: boolean;
  oauthConnected?: boolean;
  connection?: {
    oauthConnected?: boolean;
    oauthAccountName?: string;
    oauthSiteName?: string;
    baseUrl?: string;
  };
};

type Preview = {
  summary: string;
  projectKey: string;
  intent: string;
  confidence: number;
  markdown: string;
  draft: TicketDraft;
};

const AUDIENCE_OPTIONS: Array<{ id: TicketAudience; label: string; help: string }> = [
  {
    id: "both",
    label: "Dev + QA",
    help: "A build ticket and a QA companion, written like you’d brief the team.",
  },
  {
    id: "dev",
    label: "Developers",
    help: "Implementation-focused stories with clear done-when language.",
  },
  {
    id: "qa",
    label: "QA",
    help: "Human Gherkin coverage for how a real user would try it.",
  },
  {
    id: "analysis",
    label: "Analysis first",
    help: "One discovery ticket before we split build/QA work.",
  },
];

const COLORS = ["#6554C0", "#0B5FFF", "#00875A", "#FF5630", "#00A3BF", "#FF8B00"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function colorFor(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) hash = (hash + slug.charCodeAt(i) * 17) % 997;
  return COLORS[hash % COLORS.length];
}

export default function Home() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [guidance, setGuidance] = useState("");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [audience, setAudience] = useState<TicketAudience>("both");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [research, setResearch] = useState<ResearchBundle | null>(null);
  const [jiraUrlDraft, setJiraUrlDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [newJiraUrl, setNewJiraUrl] = useState("");

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId],
  );

  const signedIn = Boolean(
    authStatus?.oauthConnected || authStatus?.connection?.oauthConnected,
  );

  const jiraUrl =
    activeCompany?.connection.baseUrl ||
    activeCompany?.connection.oauthSiteName ||
    "";

  async function refreshCompanies(preferredId?: string) {
    const response = await fetch("/api/companies");
    const data = await response.json();
    setCompanies(data.companies || []);
    const nextId = preferredId || data.activeCompanyId;
    setActiveCompanyId(nextId);
    return nextId as string;
  }

  async function refreshAuth(companyId: string) {
    const response = await fetch(
      `/api/auth/atlassian/status?companyId=${companyId}`,
    );
    setAuthStatus(await response.json());
  }

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const companyId = await refreshCompanies(
        params.get("companyId") || undefined,
      );
      const companiesRes = await fetch("/api/companies");
      const companiesData = await companiesRes.json();
      const selected = (companiesData.companies || []).find(
        (c: CompanySummary) => c.id === companyId,
      );
      setJiraUrlDraft(
        selected?.connection.baseUrl || selected?.connection.oauthSiteName || "",
      );
      await refreshAuth(companyId);
      if (params.get("oauth") === "success") {
        setMessage("Signed in — I can research and create as you.");
        window.history.replaceState({}, "", "/");
      } else if (params.get("oauth") === "error") {
        setMessage(params.get("message") || "Sign-in failed");
        window.history.replaceState({}, "", "/");
      }
    })();
  }, []);

  async function switchCompany(companyId: string) {
    setBusy(true);
    try {
      await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeCompanyId: companyId }),
      });
      const response = await fetch("/api/companies");
      const data = await response.json();
      const list = (data.companies || []) as CompanySummary[];
      setCompanies(list);
      setActiveCompanyId(companyId);
      const selected = list.find((c) => c.id === companyId);
      setJiraUrlDraft(
        selected?.connection.baseUrl || selected?.connection.oauthSiteName || "",
      );
      setPreviews([]);
      setResearch(null);
      await refreshAuth(companyId);
      setMessage(`Working in ${selected?.name || "account"}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveJiraUrl() {
    if (!activeCompanyId || !jiraUrlDraft.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/companies/jira-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, jiraUrl: jiraUrlDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save URL");
      await refreshCompanies(activeCompanyId);
      setMessage(`Saved Jira URL for ${data.company.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save URL");
    } finally {
      setBusy(false);
    }
  }

  async function addCompany() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), activate: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add account");
      if (newJiraUrl.trim()) {
        await fetch("/api/companies/jira-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: data.company.id,
            jiraUrl: newJiraUrl.trim(),
          }),
        });
      }
      setNewName("");
      setNewJiraUrl("");
      await refreshCompanies(data.company.id);
      await refreshAuth(data.company.id);
      setMessage(`Added ${data.company.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add account");
    } finally {
      setBusy(false);
    }
  }

  function startSignIn() {
    if (!activeCompanyId) return;
    window.location.href = `/api/auth/atlassian/start?companyId=${encodeURIComponent(activeCompanyId)}`;
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const texts: string[] = [];
    for (const file of Array.from(fileList)) {
      if (file.type.startsWith("image/")) {
        texts.push(`FILE: ${file.name}\n[screenshot/image attached — use as visual guidance]`);
        continue;
      }
      texts.push(`FILE: ${file.name}\n${await file.text()}`);
    }
    setFiles((prev) => [...prev, ...texts].slice(-10));
    setMessage(`Added ${fileList.length} file(s) to guidance`);
  }

  async function researchAndDraft() {
    if (!guidance.trim() || !activeCompanyId) return;
    setBusy(true);
    try {
      const linkList = links
        .split(/\n|,/)
        .map((l) => l.trim())
        .filter(Boolean);
      const response = await fetch("/api/guidance/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          guidance,
          links: linkList,
          files,
          audience,
          research: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft failed");
      setPreviews(data.previews || []);
      setResearch(data.research || null);
      setMessage(
        `Drafted ${data.previews?.length || 0} ticket(s) for ${data.company.name}${
          data.research
            ? ` · used ${data.research.jiraHits?.length || 0} Jira + ${data.research.confluenceHits?.length || 0} Confluence matches`
            : " · sign in for live Jira/Confluence research"
        }`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function createAll() {
    if (!previews.length || !signedIn) return;
    setBusy(true);
    try {
      const response = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          drafts: previews.map((p) => p.draft),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Create failed");
      const count = data.results?.length || 0;
      setMessage(
        `${count} ticket(s) created as you in ${data.company?.name || "Jira"}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const audienceHelp =
    AUDIENCE_OPTIONS.find((o) => o.id === audience)?.help || "";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Ticket Flow</strong>
          <span>Write tickets like you — with real context</span>
        </div>

        <div>
          <p className="side-label">Company accounts</p>
          <div className="account-list">
            {companies.map((company) => (
              <button
                key={company.id}
                type="button"
                className="account"
                data-active={company.id === activeCompanyId}
                disabled={busy}
                onClick={() => void switchCompany(company.id)}
              >
                <span
                  className="avatar"
                  style={{ background: colorFor(company.slug) }}
                >
                  {initials(company.name)}
                </span>
                <span className="account-copy">
                  <strong>{company.name}</strong>
                  <span>
                    {company.connection.baseUrl ||
                      company.connection.oauthSiteName ||
                      "Add Jira URL"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="add-box">
          <p className="side-label" style={{ margin: 0 }}>
            Add account
          </p>
          <input
            placeholder="Company name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            placeholder="https://company.atlassian.net"
            value={newJiraUrl}
            onChange={(e) => setNewJiraUrl(e.target.value)}
          />
          <button
            type="button"
            className="btn secondary"
            disabled={busy || !newName.trim()}
            onClick={() => void addCompany()}
          >
            Add
          </button>
        </div>
      </aside>

      <main className="main">
        {message ? (
          <div
            className={`toast ${/fail|could not|error/i.test(message) ? "error" : "ok"}`}
          >
            {message}
          </div>
        ) : null}

        <section className="hero">
          <h1>
            Drop the guidance.
            <br />
            I’ll write the tickets like you would.
          </h1>
          <p>
            I search existing Jira + Confluence (and use your Figma/docs links) so
            new tickets match the wording, format, and context of what’s already
            there — then create them as you.
          </p>
        </section>

        <div className="session-row">
          <div className="who">
            {signedIn
              ? `Signed in as ${authStatus?.connection?.oauthAccountName || "you"}`
              : "Not signed in yet — needed for live research + create"}
          </div>
          <div className="actions" style={{ margin: 0 }}>
            {!signedIn ? (
              <button
                type="button"
                className="btn primary"
                disabled={busy || !authStatus?.oauthAppConfigured}
                onClick={() => startSignIn()}
              >
                Sign in to Jira
              </button>
            ) : null}
            {jiraUrl ? (
              <a className="btn ghost" href={jiraUrl} target="_blank" rel="noreferrer">
                Open Jira
              </a>
            ) : null}
          </div>
        </div>

        <section className="card">
          <div className="grid-2">
            <label className="field">
              <span>Jira URL for {activeCompany?.name || "this account"}</span>
              <input
                value={jiraUrlDraft}
                onChange={(e) => setJiraUrlDraft(e.target.value)}
                placeholder="https://christies.atlassian.net"
              />
            </label>
            <label className="field">
              <span>Who are the tickets for?</span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as TicketAudience)}
              >
                {AUDIENCE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="hint">{audienceHelp}</p>
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn secondary"
              disabled={busy || !jiraUrlDraft.trim()}
              onClick={() => void saveJiraUrl()}
            >
              Save Jira URL
            </button>
          </div>
        </section>

        <section className="card">
          <label className="field">
            <span>Guidance</span>
            <textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="Paste the brief, meeting notes, or “take this document and turn it into tickets”. Speak naturally — I’ll write in the same voice."
            />
          </label>
          <label className="field">
            <span>Links (Figma, Confluence, docs — one per line)</span>
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={3}
              placeholder={"https://www.figma.com/file/...\nhttps://…atlassian.net/wiki/..."}
              style={{ minHeight: "5.5rem" }}
            />
          </label>
          <label className="field">
            <span>Files / screenshots</span>
            <input
              type="file"
              multiple
              accept=".txt,.md,.csv,.pdf,image/*"
              onChange={(e) => void onFiles(e.target.files)}
            />
            {files.length ? (
              <p className="hint">{files.length} file(s) attached to this guidance</p>
            ) : (
              <p className="hint">
                Screenshots, exports, and notes help me match existing tools and
                wording.
              </p>
            )}
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !guidance.trim()}
              onClick={() => void researchAndDraft()}
            >
              {busy ? "Working…" : "Research & draft tickets"}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy || !previews.length || !signedIn}
              onClick={() => void createAll()}
            >
              Create in Jira as me
            </button>
          </div>
          <p className="hint">
            Prefer living in Chrome? Load unpacked{" "}
            <code>ba-jira-assistant/chrome-extension</code> — same idea, uses the
            tab you’re already logged into. See <code>docs/CHROME_AGENT.md</code>.
          </p>
        </section>

        {previews.length > 0 && (
          <section className="card">
            <div className="session-row" style={{ marginBottom: "0.25rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
                Draft tickets · {previews.length}
              </h2>
              {research ? (
                <span className="pill">
                  Context {research.jiraHits.length} Jira ·{" "}
                  {research.confluenceHits.length} Confluence
                </span>
              ) : null}
            </div>
            {previews.map((preview) => (
              <article key={`${preview.summary}-${preview.intent}`} className="ticket">
                <div className="session-row" style={{ margin: 0 }}>
                  <h3>{preview.summary}</h3>
                  <span className="pill">{preview.intent}</span>
                </div>
                <div className="meta">
                  {preview.projectKey} · {Math.round(preview.confidence * 100)}%
                  ready
                </div>
                <pre>{preview.markdown}</pre>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
