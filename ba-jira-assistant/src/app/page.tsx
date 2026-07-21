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

const AUDIENCE_OPTIONS: Array<{
  id: TicketAudience;
  label: string;
  help: string;
  icon: string;
}> = [
  {
    id: "both",
    label: "Dev + QA",
    help: "A build ticket and a QA companion, written like you’d brief the team.",
    icon: "group",
  },
  {
    id: "dev",
    label: "Developers",
    help: "Implementation-focused stories with clear done-when language.",
    icon: "code",
  },
  {
    id: "qa",
    label: "QA",
    help: "Human Gherkin coverage for how a real user would try it.",
    icon: "bug_report",
  },
  {
    id: "analysis",
    label: "Analysis first",
    help: "One discovery ticket before we split build/QA work.",
    icon: "travel_explore",
  },
];

const COLORS = ["#6554C0", "#0B5FFF", "#00875A", "#FF5630", "#00A3BF", "#FF8B00"];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden>
      {name}
    </span>
  );
}

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

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "Add Jira URL";
  }
}

export default function Home() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "researching" | "drafted" | "creating">(
    "idle",
  );
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

  const messageTone = /fail|could not|error/i.test(message) ? "error" : "ok";

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
      setStage("idle");
      await refreshAuth(companyId);
      setMessage(`Entered ${selected?.name || "account"}`);
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
      setMessage(`Saved Jira home for ${data.company.name}`);
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
      setMessage(`Opened workspace for ${data.company.name}`);
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
    setMessage(`Added ${fileList.length} file(s) to the brief`);
  }

  async function researchAndDraft() {
    if (!guidance.trim() || !activeCompanyId) return;
    setBusy(true);
    setStage("researching");
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
      setStage("drafted");
      setMessage(
        `Drafted ${data.previews?.length || 0} ticket(s) for ${data.company.name}${
          data.research
            ? ` · ${data.research.jiraHits?.length || 0} Jira + ${data.research.confluenceHits?.length || 0} Confluence`
            : " · sign in for live research"
        }`,
      );
    } catch (error) {
      setStage("idle");
      setMessage(error instanceof Error ? error.message : "Draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function createAll() {
    if (!previews.length || !signedIn) return;
    setBusy(true);
    setStage("creating");
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
      setStage("drafted");
      setMessage(
        `${count} ticket(s) created as you in ${data.company?.name || "Jira"}`,
      );
    } catch (error) {
      setStage("drafted");
      setMessage(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const audienceHelp =
    AUDIENCE_OPTIONS.find((o) => o.id === audience)?.help || "";

  const hasActivity = Boolean(
    research && (research.jiraHits.length > 0 || research.confluenceHits.length > 0),
  );

  const stageLabel =
    stage === "researching"
      ? "Researching…"
      : stage === "creating"
        ? "Creating…"
        : stage === "drafted"
          ? "Draft ready"
          : "Ready";

  const stageIcon =
    stage === "researching"
      ? "travel_explore"
      : stage === "creating"
        ? "rocket_launch"
        : stage === "drafted"
          ? "draft"
          : "hourglass_empty";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden>
              <Icon name="auto_awesome" />
            </span>
            <div>
              <strong>Ticket Flow</strong>
              <span>Portal into their world</span>
            </div>
          </div>
        </div>

        <div>
          <p className="side-label">
            <Icon name="apartment" /> Accounts
          </p>
          <div className="account-list">
            {companies.map((company) => {
              const active = company.id === activeCompanyId;
              const host = hostFromUrl(
                company.connection.baseUrl ||
                  company.connection.oauthSiteName ||
                  "",
              );
              return (
                <button
                  key={company.id}
                  type="button"
                  className="account"
                  data-active={active}
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
                    <span>{host}</span>
                  </span>
                  <span className="account-chev">
                    <Icon name={active ? "check_circle" : "chevron_right"} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="add-box">
          <p className="side-label">
            <Icon name="add_business" /> Add account
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
            <Icon name="add" />
            Open workspace
          </button>
        </div>
      </aside>

      <main className="main">
        {message ? (
          <div className={`toast ${messageTone}`} role="status">
            <Icon name={messageTone === "error" ? "error" : "check_circle"} />
            <span>{message}</span>
          </div>
        ) : null}

        <section className="portal-hero">
          <div className="portal-hero-media" aria-hidden />
          <div className="portal-hero-content">
            <p className="portal-kicker">
              <Icon name="menu_book" />
              Magazine desk → Jira board
            </p>
            <h1>
              Ticket Flow
              <br />
              <em>Drop guidance. Leave with tickets that sound like you.</em>
            </h1>
            <p>
              Pick a company world, point at their Jira, and let research + memory
              shape authentic stories — then create as your logged-in self.
            </p>
            <div className="portal-chips">
              <span className="chip">
                <Icon name="sensors" />
                Session-aware
              </span>
              <span className="chip">
                <Icon name="psychology" />
                Historical voice
              </span>
              <span className="chip">
                <Icon name="shield" />
                Confirm before create
              </span>
            </div>
          </div>
        </section>

        <div className="session-row">
          <div className="who">
            <span className={`dot ${signedIn ? "ok" : ""}`} />
            {signedIn
              ? `Signed in as ${authStatus?.connection?.oauthAccountName || "you"}`
              : "Sign in for live research + create"}
            {activeCompany ? (
              <>
                <span aria-hidden>·</span>
                <span>{activeCompany.name}</span>
              </>
            ) : null}
          </div>
          <div className="actions">
            <span className="chip stage-chip" data-stage={stage}>
              <Icon name={stageIcon} />
              {stageLabel}
            </span>
            {!signedIn ? (
              <button
                type="button"
                className={`btn primary ${busy ? "busy" : ""}`}
                disabled={busy || !authStatus?.oauthAppConfigured}
                onClick={() => startSignIn()}
              >
                <Icon name={busy ? "progress_activity" : "login"} />
                Sign in to Jira
              </button>
            ) : null}
            {jiraUrl ? (
              <a
                className="btn secondary"
                href={jiraUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="open_in_new" />
                Open Jira
              </a>
            ) : null}
          </div>
        </div>

        <div className="spread">
          <article className="mood-tile">
            <div className="mood-tile-media" aria-hidden />
            <div className="mood-tile-copy">
              <strong>Their world</strong>
              <span>
                {activeCompany
                  ? `Writing inside ${activeCompany.name} — isolated memory, DoR, and history.`
                  : "Choose an account to enter a company portal."}
              </span>
            </div>
          </article>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                <Icon name="tune" />
                Setup
              </h2>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>
                  <Icon name="link" />
                  Jira home · {activeCompany?.name || "account"}
                </span>
                <input
                  value={jiraUrlDraft}
                  onChange={(e) => setJiraUrlDraft(e.target.value)}
                  placeholder="https://christies.atlassian.net"
                />
              </label>
              <label className="field">
                <span>
                  <Icon name="record_voice_over" />
                  Tickets are for
                </span>
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
            <div className="audience-icons" aria-hidden>
              {AUDIENCE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`audience-chip ${audience === option.id ? "active" : ""}`}
                  onClick={() => setAudience(option.id)}
                >
                  <Icon name={option.icon} />
                  {option.label}
                </button>
              ))}
            </div>
            <div className="actions end">
              <button
                type="button"
                className="btn secondary"
                disabled={busy || !jiraUrlDraft.trim()}
                onClick={() => void saveJiraUrl()}
              >
                <Icon name="save" />
                Save Jira URL
              </button>
            </div>
          </section>
        </div>

        <div className={`main-grid ${hasActivity ? "has-activity" : ""}`}>
          <div className="stack">
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">
                  <Icon name="edit_note" />
                  Guidance
                </h2>
                <span className="pill">
                  <Icon name="auto_awesome" />
                  Your voice
                </span>
              </div>

              <label className="field">
                <span>
                  <Icon name="description" />
                  Brief / document
                </span>
                <textarea
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder="Paste notes or “turn this into tickets”. Speak naturally — I’ll match your voice."
                />
              </label>

              <label className="field">
                <span>
                  <Icon name="link" />
                  Links · Figma, Confluence, docs
                </span>
                <textarea
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  rows={3}
                  placeholder={
                    "https://www.figma.com/file/...\nhttps://…atlassian.net/wiki/..."
                  }
                  style={{ minHeight: "5.5rem" }}
                />
              </label>

              <div className="drop-zone">
                <div className="drop-zone-label">
                  <Icon name="upload_file" />
                  Files / screenshots
                </div>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.pdf,image/*"
                  onChange={(e) => void onFiles(e.target.files)}
                />
                <p className="hint">
                  {files.length
                    ? `${files.length} file(s) attached to this brief`
                    : "Optional — helps match existing tools and wording."}
                </p>
              </div>

              <div className="actions end">
                <button
                  type="button"
                  className={`btn secondary ${busy && stage === "creating" ? "busy" : ""}`}
                  disabled={busy || !previews.length || !signedIn}
                  onClick={() => void createAll()}
                >
                  <Icon
                    name={
                      busy && stage === "creating" ? "progress_activity" : "publish"
                    }
                  />
                  Create in Jira
                </button>
                <button
                  type="button"
                  className={`btn primary ${busy && stage === "researching" ? "busy" : ""}`}
                  disabled={busy || !guidance.trim()}
                  onClick={() => void researchAndDraft()}
                >
                  <Icon
                    name={
                      busy && stage === "researching"
                        ? "progress_activity"
                        : "travel_explore"
                    }
                  />
                  {busy && stage === "researching"
                    ? "Researching…"
                    : "Research & draft"}
                </button>
              </div>
              <p className="hint">
                <Icon name="extension" /> Chrome agent: load unpacked{" "}
                <code>ba-jira-assistant/chrome-extension</code> on a logged-in
                Jira tab for the zero-token path.
              </p>
            </section>

            {previews.length > 0 ? (
              <section className="card">
                <div className="card-head">
                  <h2 className="card-title">
                    <Icon name="stacks" />
                    Draft tickets · {previews.length}
                  </h2>
                  {research ? (
                    <span className="pill">
                      <Icon name="insights" />
                      {research.jiraHits.length} Jira ·{" "}
                      {research.confluenceHits.length} Confluence
                    </span>
                  ) : null}
                </div>
                {previews.map((preview, index) => (
                  <article
                    key={`${preview.summary}-${preview.intent}`}
                    className="ticket"
                    style={{ animationDelay: `${40 + index * 60}ms` }}
                  >
                    <div className="session-row" style={{ margin: 0 }}>
                      <h3>
                        <span className="ticket-num">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {preview.summary}
                      </h3>
                      <span className="pill">{preview.intent}</span>
                    </div>
                    <div className="meta">
                      <Icon name="flag" />
                      {preview.projectKey}
                      <span aria-hidden>·</span>
                      <Icon name="verified" />
                      {Math.round(preview.confidence * 100)}% ready
                    </div>
                    <pre>{preview.markdown}</pre>
                  </article>
                ))}
              </section>
            ) : (
              <section className="card waiting-card">
                <div className="waiting-visual" aria-hidden />
                <div>
                  <h2 className="card-title">
                    <Icon name="hourglass_empty" />
                    Your draft stack lands here
                  </h2>
                  <p className="hint">
                    After research, tickets arrive like magazine spreads —
                    numbered, scannable, ready to publish as you.
                  </p>
                </div>
              </section>
            )}
          </div>

          {hasActivity && research ? (
            <aside className="card activity">
              <div className="activity-visual" aria-hidden />
              <h2 className="card-title">
                <Icon name="hub" />
                Context found
              </h2>
              <ul className="activity-list">
                {research.jiraHits.slice(0, 6).map((hit) => (
                  <li key={hit.id}>
                    <span className="ico">
                      <Icon name="confirmation_number" />
                    </span>
                    <span>
                      <strong style={{ color: "var(--ink)" }}>{hit.id}</strong>
                      <br />
                      {hit.title}
                    </span>
                  </li>
                ))}
                {research.confluenceHits.slice(0, 5).map((hit) => (
                  <li key={`c-${hit.id}`}>
                    <span className="ico mint">
                      <Icon name="menu_book" />
                    </span>
                    <span>
                      <strong style={{ color: "var(--ink)" }}>Confluence</strong>
                      <br />
                      {hit.title}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          ) : (
            <aside className="card activity tip-rail">
              <div className="activity-visual" aria-hidden />
              <h2 className="card-title">
                <Icon name="lightbulb" />
                How the portal works
              </h2>
              <ul className="activity-list">
                <li>
                  <span className="ico">
                    <Icon name="swap_horiz" />
                  </span>
                  <span>Switch company — each world stays isolated.</span>
                </li>
                <li>
                  <span className="ico">
                    <Icon name="edit_note" />
                  </span>
                  <span>Drop a brief, files, Figma, or Confluence links.</span>
                </li>
                <li>
                  <span className="ico mint">
                    <Icon name="publish" />
                  </span>
                  <span>Review the stack, then create as your logged-in self.</span>
                </li>
              </ul>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
