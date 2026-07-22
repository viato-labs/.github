"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CompanySummary, ResearchBundle, TicketDraft } from "@/lib/types";
import type { TicketAudience } from "@/lib/guidance/draft";
import { draftToMarkdown } from "@/lib/templates/ticket-body";
import {
  bulkPackMarkdown,
  draftDescriptionForPaste,
  draftSummaryForPaste,
} from "@/lib/export/clipboard";

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

/** UK headquarters hero imagery (Wikimedia Commons, CC BY-SA). */
const HQ_HEROES: Record<
  string,
  { image: string; place: string; position: string }
> = {
  christies: {
    image:
      "https://upload.wikimedia.org/wikipedia/commons/2/2a/Christie%27s_King_Street.jpg",
    place: "Christie's · King Street, London",
    position: "center 28%",
  },
  mclaren: {
    image:
      "https://upload.wikimedia.org/wikipedia/commons/4/4c/McLaren_Technology_Centre%2C_Woking_-_geograph.org.uk_-_1836979.jpg",
    place: "McLaren Technology Centre · Woking",
    position: "center 55%",
  },
};

const DEFAULT_HQ = {
  image:
    "https://upload.wikimedia.org/wikipedia/commons/2/2a/Christie%27s_King_Street.jpg",
  place: "UK headquarters",
  position: "center 35%",
};

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
  const [refinePrompt, setRefinePrompt] = useState("");
  const [refineTarget, setRefineTarget] = useState<"all" | number>("all");
  const [chatLog, setChatLog] = useState<Array<{ role: "you" | "ai"; text: string }>>(
    [],
  );

  function setDraftsFromPreviews(next: Preview[]) {
    setPreviews(next);
  }

  function updateDraft(index: number, patch: Partial<TicketDraft>) {
    setPreviews((current) =>
      current.map((preview, i) => {
        if (i !== index) return preview;
        const draft = { ...preview.draft, ...patch };
        return {
          ...preview,
          summary: draft.summary,
          projectKey: draft.projectKey,
          intent: draft.intent,
          confidence: draft.confidence,
          markdown: draftToMarkdown(draft),
          draft,
        };
      }),
    );
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Copied ${label} to clipboard`);
    } catch {
      setMessage(`Could not copy ${label} — select the text manually`);
    }
  }

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
      setChatLog([]);
      setRefinePrompt("");
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
      setChatLog([]);
      setRefineTarget("all");
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

  async function refineWithChat() {
    if (!refinePrompt.trim() || !previews.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/guidance/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          message: refinePrompt.trim(),
          drafts: previews.map((p) => p.draft),
          targetIndex: refineTarget === "all" ? null : refineTarget,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Refine failed");
      setDraftsFromPreviews(data.previews || []);
      setChatLog((log) => {
        const next: Array<{ role: "you" | "ai"; text: string }> = [
          { role: "you", text: refinePrompt.trim() },
          { role: "ai", text: data.reply || "Updated." },
          ...log,
        ];
        return next.slice(0, 12);
      });
      setRefinePrompt("");
      setStage("drafted");
      setMessage(data.reply || "Drafts updated from your note");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refine failed");
    } finally {
      setBusy(false);
    }
  }

  async function createDrafts(which: "all" | number) {
    if (!previews.length || !signedIn) return;
    const selected =
      which === "all" ? previews : [previews[which]].filter(Boolean);
    if (!selected.length) return;
    const label =
      which === "all"
        ? `${selected.length} ticket(s)`
        : `ticket ${which + 1}`;
    const confirmed = window.confirm(
      `Create ${label} in ${activeCompany?.name || "Jira"} as you?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setStage("creating");
    try {
      const response = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          drafts: selected.map((p) => p.draft),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Create failed");
      const keys = (data.results || [])
        .map((r: { key?: string }) => r.key)
        .filter(Boolean);
      setStage("drafted");
      setMessage(
        keys.length
          ? `Created ${keys.join(", ")} as you in ${data.company?.name || "Jira"}`
          : `${data.results?.length || 0} ticket(s) created as you`,
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

  const hq =
    (activeCompany && HQ_HEROES[activeCompany.slug]) || DEFAULT_HQ;

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

        <section className="portal-hero" data-hq={activeCompany?.slug || "default"}>
          <div
            className="portal-hero-media"
            aria-hidden
            style={
              {
                "--hq-image": `url("${hq.image}")`,
                "--hq-position": hq.position,
              } as CSSProperties
            }
          />
          <div className="portal-hero-content">
            <p className="portal-kicker">
              <Icon name="location_on" />
              {hq.place}
            </p>
            <h1>
              Drop guidance.
              <em> Leave with tickets that sound like you.</em>
            </h1>
            <p>
              Select a company, add your brief, research related work, then create
              as your logged-in self.
            </p>
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

        <section className="card setup-card">
          <div className="card-head">
            <h2 className="card-title">
              <Icon name="tune" />
              1 · Setup
            </h2>
            <p className="card-sub">
              {activeCompany
                ? `Working in ${activeCompany.name}`
                : "Choose a company in the sidebar"}
            </p>
          </div>
          <div className="grid-3">
            <label className="field">
              <span>
                <Icon name="link" />
                Jira home
              </span>
              <input
                value={jiraUrlDraft}
                onChange={(e) => setJiraUrlDraft(e.target.value)}
                placeholder="https://christiestech.atlassian.net"
              />
            </label>
            <div className="field">
              <span>
                <Icon name="record_voice_over" />
                Tickets are for
              </span>
              <div className="audience-icons">
                {AUDIENCE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`audience-chip ${audience === option.id ? "active" : ""}`}
                    onClick={() => setAudience(option.id)}
                    title={option.help}
                  >
                    <Icon name={option.icon} />
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="hint">{audienceHelp}</p>
            </div>
            <div className="field actions-field">
              <span>
                <Icon name="save" />
                Save
              </span>
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
          </div>
        </section>

        <div className={`workbench ${hasActivity ? "has-context" : ""}`}>
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                <Icon name="edit_note" />
                2 · Guidance
              </h2>
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

            <div className="grid-2">
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
                    ? `${files.length} file(s) attached`
                    : "Optional context for wording and tools."}
                </p>
              </div>
            </div>

              <div className="actions end">
                <button
                  type="button"
                  className={`btn secondary ${busy && stage === "creating" ? "busy" : ""}`}
                  disabled={busy || !previews.length || !signedIn}
                  onClick={() => void createDrafts("all")}
                >
                  <Icon
                    name={
                      busy && stage === "creating" ? "progress_activity" : "publish"
                    }
                  />
                  Create all in Jira
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
          </section>

          {hasActivity && research ? (
            <aside className="card activity">
              <h2 className="card-title">
                <Icon name="hub" />
                Context found
              </h2>
              <ul className="activity-list">
                {research.jiraHits.slice(0, 8).map((hit) => (
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
                {research.confluenceHits.slice(0, 6).map((hit) => (
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
          ) : null}
        </div>

        <section className="card drafts-card">
          <div className="card-head">
            <h2 className="card-title">
              <Icon name="stacks" />
              3 · Review & revise
              {previews.length ? ` · ${previews.length}` : ""}
            </h2>
            {research ? (
              <span className="pill">
                <Icon name="insights" />
                {research.jiraHits.length} Jira · {research.confluenceHits.length}{" "}
                Confluence
              </span>
            ) : null}
          </div>

          {previews.length > 0 ? (
            <>
              <div className="refine-panel">
                <div className="card-head" style={{ marginBottom: "0.75rem" }}>
                  <h3 className="card-title">
                    <Icon name="chat" />
                    Ask for changes
                  </h3>
                </div>
                <div className="refine-row">
                  <select
                    value={refineTarget === "all" ? "all" : String(refineTarget)}
                    onChange={(e) =>
                      setRefineTarget(
                        e.target.value === "all" ? "all" : Number(e.target.value),
                      )
                    }
                    aria-label="Which draft to refine"
                  >
                    <option value="all">All drafts</option>
                    {previews.map((preview, index) => (
                      <option key={`${preview.intent}-${index}`} value={index}>
                        Ticket {index + 1}: {preview.summary.slice(0, 48)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    placeholder='e.g. “shorten the title”, “add another QA scenario”, “make the tone softer”'
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void refineWithChat();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !refinePrompt.trim()}
                    onClick={() => void refineWithChat()}
                  >
                    <Icon name="auto_fix" />
                    Revise
                  </button>
                </div>
                {chatLog.length > 0 ? (
                  <ul className="chat-log">
                    {chatLog.map((entry, index) => (
                      <li key={`${entry.role}-${index}`} data-role={entry.role}>
                        <strong>{entry.role === "you" ? "You" : "Ticket Flow"}</strong>
                        <span>{entry.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">
                    Edit any field below, or chat a change. Then copy sections into
                    Jira yourself, or create one / all as you.
                  </p>
                )}
                <div className="actions" style={{ marginTop: "0.85rem" }}>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() =>
                      void copyText(
                        "all drafts",
                        bulkPackMarkdown(previews.map((p) => p.draft)),
                      )
                    }
                  >
                    <Icon name="content_copy" />
                    Copy all for paste
                  </button>
                  <button
                    type="button"
                    className={`btn secondary ${busy && stage === "creating" ? "busy" : ""}`}
                    disabled={busy || !signedIn}
                    onClick={() => void createDrafts("all")}
                  >
                    <Icon name="publish" />
                    Create all in Jira
                  </button>
                </div>
              </div>

              <div className="ticket-grid">
                {previews.map((preview, index) => (
                  <article
                    key={`${preview.draft.intent}-${index}`}
                    className="ticket ticket-edit"
                    style={{ animationDelay: `${40 + index * 60}ms` }}
                  >
                    <div className="session-row" style={{ margin: 0 }}>
                      <h3>
                        <span className="ticket-num">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        Edit draft
                      </h3>
                      <span className="pill">{preview.intent}</span>
                    </div>
                    <label className="field">
                      <span>Summary</span>
                      <input
                        value={preview.draft.summary}
                        onChange={(e) =>
                          updateDraft(index, { summary: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Product overview</span>
                      <textarea
                        rows={2}
                        value={preview.draft.productOverview}
                        onChange={(e) =>
                          updateDraft(index, { productOverview: e.target.value })
                        }
                        style={{ minHeight: "4rem" }}
                      />
                    </label>
                    <label className="field">
                      <span>Description</span>
                      <textarea
                        rows={8}
                        value={preview.draft.description}
                        onChange={(e) =>
                          updateDraft(index, { description: e.target.value })
                        }
                      />
                    </label>
                    <div className="meta">
                      <Icon name="flag" />
                      {preview.projectKey}
                      <span aria-hidden>·</span>
                      <Icon name="verified" />
                      {Math.round(preview.confidence * 100)}% ready
                    </div>
                    <details className="ticket-preview">
                      <summary>Full ticket preview</summary>
                      <pre>{preview.markdown}</pre>
                    </details>
                    <div className="actions ticket-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          void copyText(
                            "summary",
                            draftSummaryForPaste(preview.draft),
                          )
                        }
                      >
                        <Icon name="title" />
                        Copy summary
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          void copyText(
                            "description",
                            draftDescriptionForPaste(preview.draft),
                          )
                        }
                      >
                        <Icon name="content_copy" />
                        Copy body
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy || !signedIn}
                        onClick={() => void createDrafts(index)}
                      >
                        <Icon name="publish" />
                        Create this one
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-hint">
              Drafts appear here after you run <strong>Research & draft</strong>.
              Then edit by hand or chat changes before create / copy.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
