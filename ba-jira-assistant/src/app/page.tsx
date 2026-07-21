"use client";

import { useEffect, useMemo, useState } from "react";
import {
  bulkPackMarkdown,
  draftDescriptionForPaste,
  draftSummaryForPaste,
} from "@/lib/export/clipboard";
import type {
  ChatMessage,
  CompanySummary,
  PlaybookId,
  ResearchBundle,
  TicketDraft,
  WorkflowTransition,
} from "@/lib/types";

type AuthStatus = {
  ok: boolean;
  dryRun: boolean;
  connected?: boolean;
  mode?: string;
  message: string;
  oauthAppConfigured?: boolean;
  oauthConnected?: boolean;
  companyName?: string;
  connection?: {
    oauthConnected?: boolean;
    oauthAccountName?: string;
    oauthSiteName?: string;
  };
};

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [playbookId, setPlaybookId] = useState<PlaybookId>("single-brief");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(
    "Buyers need to save a lot from search results on web. Epic: Discovery. Priority: High. Users can save and see it in My Lots.",
  );
  const [files, setFiles] = useState<string[]>([]);
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [bulkDrafts, setBulkDrafts] = useState<TicketDraft[]>([]);
  const [bulkSummaries, setBulkSummaries] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [showCompanies, setShowCompanies] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [editKey, setEditKey] = useState("");
  const [research, setResearch] = useState<ResearchBundle | null>(null);
  const [moveAfterCreate, setMoveAfterCreate] = useState(true);
  const [postCreateStatus, setPostCreateStatus] = useState("In Analysis");
  const [transitionKey, setTransitionKey] = useState("");
  const [availableTransitions, setAvailableTransitions] = useState<
    WorkflowTransition[]
  >([]);
  const [currentStatus, setCurrentStatus] = useState("");
  const [selectedTransitionId, setSelectedTransitionId] = useState("");
  const [targetStatusShortcut, setTargetStatusShortcut] = useState("In Analysis");

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId],
  );

  const signedIn = Boolean(
    authStatus?.oauthConnected || authStatus?.connection?.oauthConnected,
  );

  function applyCompanyWorkflowDefaults(company?: CompanySummary | null) {
    if (!company?.workflow) return;
    const defaultStatus =
      company.workflow.defaultPostCreateStatus ||
      company.workflow.commonStatuses[0] ||
      "In Analysis";
    setPostCreateStatus(defaultStatus);
    setTargetStatusShortcut(defaultStatus);
    setMoveAfterCreate(Boolean(company.workflow.enablePostCreateTransition));
  }

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
    const data = await response.json();
    setAuthStatus(data);
  }

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauth = params.get("oauth");
      const preferredCompany = params.get("companyId") || undefined;
      const companyId = await refreshCompanies(preferredCompany || undefined);
      await refreshAuth(companyId);

      if (oauth === "success") {
        setLastResult("Signed in with Microsoft/Atlassian — app can act as you in Jira");
        window.history.replaceState({}, "", "/");
      } else if (oauth === "error") {
        setLastResult(params.get("message") || "OAuth sign-in failed");
        window.history.replaceState({}, "", "/");
      }

      const companyRes = await fetch(`/api/chat?companyId=${companyId}`);
      const companyData = await companyRes.json();
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: `Working in **${companyData.company.name}**. Path B: **Sign in with Microsoft**, then drafts search that company's Jira + Confluence and remember historical style/context so a new ticket (e.g. calendar) connects to how existing features work.`,
        },
      ]);
      setPlaybookId(
        (companyData.company.playbooks?.[0]?.id as PlaybookId) || "single-brief",
      );
      const companiesRes = await fetch("/api/companies");
      const companiesData = await companiesRes.json();
      const current = (companiesData.companies || []).find(
        (c: CompanySummary) => c.id === companyId,
      );
      applyCompanyWorkflowDefaults(current);
    })();
  }, []);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setLastResult(`Copied ${label}`);
    } catch {
      setLastResult(`Could not copy ${label}`);
    }
  }

  function downloadBulkPack() {
    if (!bulkDrafts.length) return;
    const content = bulkPackMarkdown(bulkDrafts);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeCompany?.slug || "company"}-ticket-pack.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setLastResult(`Downloaded ${bulkDrafts.length}-ticket pack`);
  }

  async function switchCompany(companyId: string) {
    setBusy(true);
    try {
      const switched = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeCompanyId: companyId }),
      });
      const switchedData = await switched.json();
      const nextCompanies = (switchedData.companies || []) as CompanySummary[];
      setCompanies(nextCompanies);
      setActiveCompanyId(companyId);
      await refreshAuth(companyId);
      setDraft(null);
      setBulkDrafts([]);
      setBulkSummaries([]);
      setPreview("");
      setResearch(null);
      const company = nextCompanies.find((c) => c.id === companyId);
      setPlaybookId(
        (company?.playbooks?.[0]?.id as PlaybookId) || "single-brief",
      );
      applyCompanyWorkflowDefaults(company);
      setMessages([
        {
          id: uid(),
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: `Switched to **${company?.name || companyId}**. Sign in with Microsoft for this company if you want the app to create/edit Jira as you there.`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function startSignIn() {
    if (!activeCompanyId) return;
    window.location.href = `/api/auth/atlassian/start?companyId=${encodeURIComponent(activeCompanyId)}`;
  }

  async function signOut() {
    if (!activeCompanyId) return;
    setBusy(true);
    try {
      await fetch("/api/auth/atlassian/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      await refreshCompanies(activeCompanyId);
      await refreshAuth(activeCompanyId);
      setLastResult("Signed out of Jira for this company");
    } finally {
      setBusy(false);
    }
  }

  async function sendBrief() {
    const message = input.trim();
    if (!message || busy || !activeCompanyId) return;
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          files,
          companyId: activeCompanyId,
          playbookId:
            playbookId === "bulk-rows" ||
            playbookId === "field-trip-by-engagement" ||
            playbookId === "configurator-design-sections"
              ? "single-brief"
              : playbookId,
        }),
      });
      const data = await response.json();
      setDraft(data.draft);
      setResearch(data.research || null);
      setBulkDrafts([]);
      setBulkSummaries([]);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: signedIn
            ? `${data.reply}\n\nSigned in — researched Jira/Confluence, updated company memory, and you can create this ticket as you.`
            : `${data.reply}\n\nNot signed in yet — Sign in with Microsoft to unlock live Jira/Confluence research, or copy/paste manually.`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPreview(
        (
          await (
            await fetch("/api/tickets/preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ draft: data.draft }),
            })
          ).json()
        ).markdown || "",
      );
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: "Something went wrong while drafting. Try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function createTicket() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          companyId: activeCompanyId,
          transitionToStatus: moveAfterCreate ? postCreateStatus : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Create failed");
        return;
      }
      const result = data.result;
      const transitionNote = result.transition?.message
        ? ` ${result.transition.message}`
        : "";
      setLastResult(
        `${result.dryRun ? "Dry-run" : "Created"} ${result.key} as you in ${data.company.name}.${transitionNote}`,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `${result.dryRun ? "Dry-run ticket" : "Created Jira issue"} **${result.key}** in ${data.company.name}.${
            result.transition ? `\n${result.transition.message}` : ""
          }`,
          createdAt: new Date().toISOString(),
        },
      ]);
      if (result.key) setTransitionKey(result.key);
      setPreview(result.previewMarkdown || preview);
      await refreshCompanies(activeCompanyId);
    } catch {
      setLastResult("Create request failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateTicket() {
    if (!draft || !editKey.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/tickets/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueKey: editKey.trim(),
          draft,
          companyId: activeCompanyId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Update failed");
        return;
      }
      setLastResult(`Updated ${data.result.key} as you`);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `Updated Jira issue **${data.result.key}** using the current draft.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setLastResult("Update request failed");
    } finally {
      setBusy(false);
    }
  }

  async function createBulkDrafts() {
    if (!bulkDrafts.length || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          drafts: bulkDrafts,
          transitionToStatus: moveAfterCreate ? postCreateStatus : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Bulk create failed");
        return;
      }
      const createdCount = data.results?.length || 0;
      const dryRun = data.results?.[0]?.dryRun;
      const moved = (data.results || []).filter(
        (r: { transition?: { dryRun?: boolean; toStatus?: string } }) =>
          r.transition && !r.transition.dryRun,
      ).length;
      setLastResult(
        `${createdCount} ticket(s) ${dryRun ? "dry-run" : "created"} as you for ${data.company.name}${
          moveAfterCreate ? ` · ${moved} moved toward ${postCreateStatus}` : ""
        }`,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `Bulk ${dryRun ? "dry-run" : "create"} complete for **${data.company.name}**: ${createdCount} tickets${
            moveAfterCreate
              ? `, with post-create status targeting **${postCreateStatus}** where the workflow allows it.`
              : "."
          }`,
          createdAt: new Date().toISOString(),
        },
      ]);
      await refreshCompanies(activeCompanyId);
    } catch {
      setLastResult("Bulk create failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadTransitions() {
    if (!transitionKey.trim() || !activeCompanyId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/tickets/transitions?issueKey=${encodeURIComponent(transitionKey.trim())}&companyId=${encodeURIComponent(activeCompanyId)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Could not load transitions");
        return;
      }
      setAvailableTransitions(data.transitions || []);
      setCurrentStatus(data.currentStatus || "");
      setSelectedTransitionId(data.transitions?.[0]?.id || "");
      setLastResult(
        `${transitionKey.trim()} is in ${data.currentStatus || "unknown"}. ${data.transitions?.length || 0} transition(s) available.`,
      );
    } catch {
      setLastResult("Could not load transitions");
    } finally {
      setBusy(false);
    }
  }

  async function applyTransition(confirm: boolean) {
    if (!transitionKey.trim() || !activeCompanyId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/tickets/transitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          issueKey: transitionKey.trim(),
          targetStatus: targetStatusShortcut,
          transitionId: confirm ? selectedTransitionId || undefined : undefined,
          confirm,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Transition failed");
        return;
      }
      setAvailableTransitions(data.result?.availableTransitions || []);
      setLastResult(data.result?.message || "Transition checked");
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: data.result?.message || "Transition checked",
          createdAt: new Date().toISOString(),
        },
      ]);
      if (confirm) {
        // Refresh allowed transitions from the new status.
        const refresh = await fetch(
          `/api/tickets/transitions?issueKey=${encodeURIComponent(transitionKey.trim())}&companyId=${encodeURIComponent(activeCompanyId)}`,
        );
        const refreshData = await refresh.json();
        if (refresh.ok) {
          setAvailableTransitions(refreshData.transitions || []);
          setCurrentStatus(refreshData.currentStatus || "");
          setSelectedTransitionId(refreshData.transitions?.[0]?.id || "");
        }
      }
    } catch {
      setLastResult("Transition request failed");
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(file?: File) {
    if (!activeCompanyId || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        companyId: activeCompanyId,
        playbookId,
        create: false,
        useKnowledgeSections: playbookId === "configurator-design-sections",
      };

      if (file) {
        payload.fileName = file.name;
        payload.fileBase64 = await fileToBase64(file);
      }

      const response = await fetch("/api/tickets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Bulk failed");
        return;
      }

      const drafts = (data.previews || []).map(
        (p: { draft: TicketDraft }) => p.draft,
      ) as TicketDraft[];
      setBulkDrafts(drafts);
      setBulkSummaries(
        (data.previews || []).map(
          (p: { summary: string; confidence: number; projectKey: string }) =>
            `${p.summary} · ${p.projectKey} · ${Math.round(p.confidence * 100)}%`,
        ),
      );
      setDraft(drafts[0] || null);
      setPreview(data.previews?.[0]?.markdown || "");
      setLastResult(`Drafted ${data.draftCount} ticket(s) from ${data.sheetName}`);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `Prepared **${data.draftCount}** drafts for **${data.company.name}**. ${
            signedIn
              ? "Create them in Jira as you, or download a paste pack."
              : "Sign in with Microsoft to create them as you."
          }`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setLastResult("Bulk request failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFileChange(fileList: FileList | null) {
    if (!fileList?.length) return;
    const selected = Array.from(fileList);
    const spreadsheet = selected.find((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name),
    );

    if (
      spreadsheet &&
      (playbookId === "bulk-rows" ||
        playbookId === "field-trip-by-engagement" ||
        playbookId === "configurator-design-sections")
    ) {
      await runBulk(spreadsheet);
      return;
    }

    const texts: string[] = [];
    for (const file of selected) {
      const content = await file.text();
      texts.push(`FILE: ${file.name}\n${content}`);
    }
    setFiles((prev) => [...prev, ...texts].slice(-8));
  }

  async function addCompany() {
    if (!newCompanyName.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCompanyName.trim(), activate: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Could not add company");
        return;
      }
      setNewCompanyName("");
      await refreshCompanies(data.company.id);
      await refreshAuth(data.company.id);
      setLastResult(`Added company ${data.company.name}`);
    } finally {
      setBusy(false);
    }
  }

  const statusTone = signedIn ? "ok" : "warn";

  return (
    <main className="app-shell">
      <h1 className="brand">BA Jira Assistant</h1>
      <p className="lede">
        Path B: sign in with Microsoft through Atlassian, then this app creates and
        edits Jira tickets as you — per company workspace.
      </p>

      <div className="status-row">
        <label className="chip">
          Company{" "}
          <select
            value={activeCompanyId}
            disabled={busy}
            onChange={(e) => void switchCompany(e.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="chip">
          Playbook{" "}
          <select
            value={playbookId}
            disabled={busy || !activeCompany}
            onChange={(e) => setPlaybookId(e.target.value as PlaybookId)}
          >
            {(activeCompany?.playbooks || []).map((playbook) => (
              <option key={playbook.id} value={playbook.id}>
                {playbook.name}
              </option>
            ))}
          </select>
        </label>
        <span className="chip" data-tone={statusTone}>
          {authStatus?.message || "Checking Jira sign-in…"}
        </span>
        {draft ? (
          <span className="chip">
            Draft confidence {Math.round(draft.confidence * 100)}%
          </span>
        ) : null}
        {lastResult ? <span className="chip">{lastResult}</span> : null}
      </div>

      <div className="actions" style={{ marginTop: "0.85rem" }}>
        {!signedIn ? (
          <button
            className="primary"
            disabled={busy || !authStatus?.oauthAppConfigured}
            onClick={() => startSignIn()}
          >
            Sign in with Microsoft
          </button>
        ) : (
          <button disabled={busy} onClick={() => void signOut()}>
            Sign out of Jira for this company
          </button>
        )}
        <button disabled={busy} onClick={() => setShowCompanies((v) => !v)}>
          {showCompanies ? "Hide companies" : "Add company workspace"}
        </button>
        {playbookId === "configurator-design-sections" ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void runBulk()}
          >
            Draft design tickets from knowledge
          </button>
        ) : null}
        {bulkDrafts.length ? (
          <>
            <button disabled={busy} onClick={() => downloadBulkPack()}>
              Download paste pack
            </button>
            <button
              className="primary"
              disabled={busy || !signedIn}
              onClick={() => void createBulkDrafts()}
            >
              Create all in Jira as me
            </button>
          </>
        ) : null}
      </div>

      {!authStatus?.oauthAppConfigured ? (
        <p className="hint" style={{ marginTop: "0.85rem" }}>
          OAuth app not configured yet. Add <code>ATLASSIAN_CLIENT_ID</code> and{" "}
          <code>ATLASSIAN_CLIENT_SECRET</code> from an Atlassian developer OAuth
          2.0 (3LO) app. Callback URL:{" "}
          <code>http://localhost:3000/api/auth/atlassian/callback</code>. See{" "}
          <code>docs/CORPORATE_SSO.md</code>.
        </p>
      ) : null}

      {showCompanies ? (
        <section className="panel" style={{ marginTop: "1rem", minHeight: 0 }}>
          <div className="panel-header">Company workspaces</div>
          <div className="composer">
            <p className="file-row">
              Each company has its own knowledge + its own Microsoft/Atlassian
              sign-in session.
            </p>
            <div className="file-row">
              <input
                placeholder="Add another company name"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
              <button disabled={busy} onClick={() => void addCompany()}>
                Add company workspace
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="workspace">
        <section className="panel">
          <div className="panel-header">Brief / bulk intake</div>
          <div className="chat-log" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className="bubble" data-role={message.role}>
                {message.content}
              </div>
            ))}
          </div>
          <div className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Epic: Discovery. Buyers should…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendBrief();
                }
              }}
            />
            <div className="file-row">
              <label>
                Upload notes / Excel / CSV{" "}
                <input
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.txt,.md"
                  onChange={(e) => void onFileChange(e.target.files)}
                />
              </label>
              <span>
                {files.length
                  ? `${files.length} note file(s) staged`
                  : "Spreadsheets auto-run the selected bulk playbook"}
              </span>
            </div>
            <div className="file-row">
              <label>
                <input
                  type="checkbox"
                  checked={moveAfterCreate}
                  onChange={(e) => setMoveAfterCreate(e.target.checked)}
                />{" "}
                After create, move to
              </label>
              <select
                value={postCreateStatus}
                disabled={!moveAfterCreate}
                onChange={(e) => setPostCreateStatus(e.target.value)}
              >
                {(
                  activeCompany?.workflow.commonStatuses || [
                    "In Analysis",
                    "To Do",
                    "In Progress",
                    "In Review",
                  ]
                ).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="actions">
              <button
                className="primary"
                disabled={busy || !input.trim()}
                onClick={() => void sendBrief()}
              >
                Draft from brief
              </button>
              <button
                className="primary"
                disabled={busy || !draft || !signedIn}
                onClick={() => void createTicket()}
              >
                Create in Jira as me
              </button>
              <button
                disabled={!draft}
                onClick={() =>
                  draft && void copyText("summary", draftSummaryForPaste(draft))
                }
              >
                Copy summary
              </button>
              <button
                disabled={!draft}
                onClick={() =>
                  draft &&
                  void copyText("description", draftDescriptionForPaste(draft))
                }
              >
                Copy description
              </button>
            </div>
            <div className="file-row">
              <input
                placeholder="Existing issue key to edit (e.g. WEB-123)"
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
              />
              <button
                disabled={busy || !draft || !editKey.trim() || !signedIn}
                onClick={() => void updateTicket()}
              >
                Update issue as me
              </button>
            </div>
            <div className="file-row">
              <input
                placeholder="Issue key for status change (e.g. FIELD-45)"
                value={transitionKey}
                onChange={(e) => setTransitionKey(e.target.value)}
              />
              <button
                disabled={busy || !transitionKey.trim() || !signedIn}
                onClick={() => void loadTransitions()}
              >
                Load allowed statuses
              </button>
            </div>
            {availableTransitions.length || currentStatus ? (
              <div className="file-row">
                <span>Current: {currentStatus || "unknown"}</span>
                <select
                  value={targetStatusShortcut}
                  onChange={(e) => setTargetStatusShortcut(e.target.value)}
                >
                  {(activeCompany?.workflow.commonStatuses || []).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedTransitionId}
                  onChange={(e) => setSelectedTransitionId(e.target.value)}
                >
                  {availableTransitions.map((transition) => (
                    <option key={transition.id} value={transition.id}>
                      {transition.name} → {transition.toStatus}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !signedIn || !transitionKey.trim()}
                  onClick={() => void applyTransition(false)}
                >
                  Preview move
                </button>
                <button
                  className="primary"
                  disabled={busy || !signedIn || !transitionKey.trim()}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Move ${transitionKey.trim()} toward "${targetStatusShortcut}" using only a Jira-allowed transition?`,
                      )
                    ) {
                      void applyTransition(true);
                    }
                  }}
                >
                  Confirm status change
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">Preview / bulk queue</div>
          <div className="side-meta">
            <div>
              {activeCompany
                ? `${activeCompany.name} boards: ${activeCompany.boards
                    .map((b) => b.projectKey)
                    .join(", ")}`
                : "Select a company"}
            </div>
            <div>
              {activeCompany?.playbooks.find((p) => p.id === playbookId)
                ?.description || "Choose a playbook"}
            </div>
            <div>
              {signedIn
                ? `Acting as ${authStatus?.connection?.oauthAccountName || "you"} on ${authStatus?.connection?.oauthSiteName || "Jira"}.`
                : "Sign in with Microsoft to create/edit as you."}
            </div>
            {research ? (
              <div>
                Research: {research.jiraHits.length} Jira ·{" "}
                {research.confluenceHits.length} Confluence
                <ul>
                  {research.jiraHits.slice(0, 4).map((hit) => (
                    <li key={hit.id}>
                      Jira {hit.id}: {hit.title}
                    </li>
                  ))}
                  {research.confluenceHits.slice(0, 3).map((hit) => (
                    <li key={`c-${hit.id}`}>Confluence: {hit.title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bulkSummaries.length ? (
              <div>
                Bulk queue ({bulkSummaries.length}):
                <ul>
                  {bulkSummaries.slice(0, 12).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : draft?.missingFields?.length ? (
              <div>Gaps: {draft.missingFields.join(", ")}</div>
            ) : (
              <div>Gaps: none flagged</div>
            )}
          </div>
          <div className="preview">
            <pre>{preview || "Draft a brief or upload a spreadsheet to preview."}</pre>
          </div>
        </section>
      </div>

      <p className="hint">
        Sign-in opens Atlassian consent, then your company Microsoft login/MFA.
        Tokens are stored per company under <code>.data/workspaces/</code> and
        never ask for your password in this app. Setup:{" "}
        <code>docs/CORPORATE_SSO.md</code>.
      </p>
    </main>
  );
}
