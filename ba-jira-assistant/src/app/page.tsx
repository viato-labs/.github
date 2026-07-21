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

type WizardStep = 1 | 2 | 3 | 4 | 5;
type TaskId = "brief" | "bulk" | "update" | "move" | "paste";

const TASKS: Array<{
  id: TaskId;
  title: string;
  description: string;
  hint: string;
}> = [
  {
    id: "brief",
    title: "Write one ticket",
    description: "Paste a short brief, research history, then create in Jira.",
    hint: "Best for a single story or bug.",
  },
  {
    id: "bulk",
    title: "Bulk from Excel / CSV",
    description: "Upload a sheet and draft many tickets with a company playbook.",
    hint: "Christie’s engagement sheets → SCO tickets on BAU.",
  },
  {
    id: "update",
    title: "Update an existing ticket",
    description: "Draft improvements, then update a Jira key as you.",
    hint: "Never deletes. Only updates what you confirm.",
  },
  {
    id: "move",
    title: "Move ticket status",
    description: "Preview allowed workflow transitions, then confirm the move.",
    hint: "Christie’s often: In Analysis.",
  },
  {
    id: "paste",
    title: "Copy / paste pack",
    description: "Generate text you can paste into Jira manually.",
    hint: "Fallback if you’re not signed in yet.",
  },
];

function stepLabel(step: WizardStep) {
  switch (step) {
    case 1:
      return "Company";
    case 2:
      return "Sign in";
    case 3:
      return "Task";
    case 4:
      return "Work";
    case 5:
      return "Review";
  }
}

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
  const [step, setStep] = useState<WizardStep>(1);
  const [task, setTask] = useState<TaskId>("brief");
  const [transitionConfirm, setTransitionConfirm] = useState(false);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId],
  );

  const signedIn = Boolean(
    authStatus?.oauthConnected || authStatus?.connection?.oauthConnected,
  );

  const selectedTask = TASKS.find((item) => item.id === task)!;
  const hasReview = Boolean(draft || bulkDrafts.length || preview);

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
        setStep(3);
        window.history.replaceState({}, "", "/");
      } else if (oauth === "error") {
        setLastResult(params.get("message") || "OAuth sign-in failed");
        setStep(2);
        window.history.replaceState({}, "", "/");
      }

      const companyRes = await fetch(`/api/chat?companyId=${companyId}`);
      const companyData = await companyRes.json();
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: `Working in **${companyData.company.name}**. Sign in, pick a task, then follow the steps.`,
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
      setLastResult(`Working in ${company?.name || companyId}`);
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
            ? `${data.reply}\n\nSigned in — researched Jira/Confluence and ready to create as you.`
            : `${data.reply}\n\nNot signed in — you can still copy/paste, or sign in to create in Jira.`,
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
      setLastResult("Draft ready — review, then create or copy.");
      setStep(5);
    } catch {
      setLastResult("Something went wrong while drafting. Try again.");
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
      setTransitionConfirm(false);
      setLastResult(
        `${transitionKey.trim()} is in ${data.currentStatus || "unknown"}. ${data.transitions?.length || 0} move(s) available.`,
      );
    } catch {
      setLastResult("Could not load transitions");
    } finally {
      setBusy(false);
    }
  }

  async function applyTransition(confirm: boolean) {
    if (!transitionKey.trim() || !activeCompanyId || busy) return;
    if (confirm && !transitionConfirm) {
      setLastResult("Tick the confirmation box before moving the ticket.");
      return;
    }
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
      if (confirm) {
        const refresh = await fetch(
          `/api/tickets/transitions?issueKey=${encodeURIComponent(transitionKey.trim())}&companyId=${encodeURIComponent(activeCompanyId)}`,
        );
        const refreshData = await refresh.json();
        if (refresh.ok) {
          setAvailableTransitions(refreshData.transitions || []);
          setCurrentStatus(refreshData.currentStatus || "");
          setSelectedTransitionId(refreshData.transitions?.[0]?.id || "");
          setTransitionConfirm(false);
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
      setStep(5);
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
      (task === "bulk" ||
        playbookId === "bulk-rows" ||
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
    setLastResult(`Attached ${selected.length} note file(s).`);
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
      applyCompanyWorkflowDefaults(data.company);
      setLastResult(`Added company ${data.company.name}`);
    } finally {
      setBusy(false);
    }
  }

  function goTo(next: WizardStep) {
    setStep(next);
  }

  function chooseTask(next: TaskId) {
    setTask(next);
    if (next === "bulk") {
      const bulkPlaybook =
        (activeCompany?.playbooks.find((p) =>
          ["field-trip-by-engagement", "bulk-rows", "configurator-design-sections"].includes(
            p.id,
          ),
        )?.id as PlaybookId | undefined) || "bulk-rows";
      setPlaybookId(bulkPlaybook);
    } else if (next === "brief" || next === "update" || next === "paste") {
      setPlaybookId("single-brief");
    }
  }

  function startAnotherTask() {
    setDraft(null);
    setBulkDrafts([]);
    setBulkSummaries([]);
    setPreview("");
    setResearch(null);
    setFiles([]);
    setEditKey("");
    setAvailableTransitions([]);
    setCurrentStatus("");
    setTransitionConfirm(false);
    goTo(3);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden />
          <div>
            <p className="brand">Ticket Flow</p>
            <p className="brand-sub">BA assistant for Jira</p>
          </div>
        </div>
        <div className="auth-chip" aria-live="polite">
          {signedIn ? (
            <>
              <span className="dot ok" />
              {authStatus?.connection?.oauthAccountName || "Signed in"}
            </>
          ) : (
            <>
              <span className="dot" />
              Not signed in
            </>
          )}
        </div>
      </header>

      <section className="hero-band">
        <p className="eyebrow">Simple path from brief → Jira</p>
        <h1>Create authentic tickets without wrestling the UI.</h1>
        <p className="lede">
          Pick the company, sign in once, choose one task, then follow the steps.
          No deletes. Updates and status moves only when you confirm.
        </p>
      </section>

      <ol className="stepper" aria-label="Progress">
        {([1, 2, 3, 4, 5] as WizardStep[]).map((item) => (
          <li key={item}>
            <button
              type="button"
              className={`step ${step === item ? "active" : ""} ${step > item ? "done" : ""}`}
              onClick={() => {
                if (item <= step || (item === 5 && hasReview)) goTo(item);
                else if (item === 2 && activeCompanyId) goTo(2);
                else if (item === 3 && activeCompanyId) goTo(3);
                else if (item === 4 && activeCompanyId) goTo(4);
              }}
            >
              <span className="step-index">{item}</span>
              <span className="step-label">{stepLabel(item)}</span>
            </button>
          </li>
        ))}
      </ol>

      {lastResult ? (
        <div
          className={`toast ${/fail|wrong|could not|error/i.test(lastResult) ? "error" : "ok"}`}
          role="status"
        >
          {lastResult}
        </div>
      ) : null}

      {step === 1 && (
        <section className="stage" key="step-1">
          <div className="stage-head">
            <p className="stage-kicker">Step 1</p>
            <h2>Which company are you working in?</h2>
            <p>Each company keeps its own Jira site, playbooks, and memory sealed.</p>
          </div>
          <div className="choice-grid">
            {companies.map((company) => (
              <button
                key={company.id}
                type="button"
                className={`choice-card ${activeCompanyId === company.id ? "selected" : ""}`}
                disabled={busy}
                onClick={() => void switchCompany(company.id)}
              >
                <strong>{company.name}</strong>
                <span>
                  {company.boards.map((b) => b.projectKey).join(", ") || "No boards yet"}
                </span>
                <em>{company.playbooks.length} playbook(s)</em>
              </button>
            ))}
          </div>
          <div className="soft-panel">
            <h3>Add another company</h3>
            <div className="field-row">
              <label className="field">
                <span>Company name</span>
                <input
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Acme Retail"
                />
              </label>
              <div className="field" style={{ alignSelf: "end" }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy || !newCompanyName.trim()}
                  onClick={() => void addCompany()}
                >
                  Add workspace
                </button>
              </div>
            </div>
          </div>
          <div className="nav-row">
            <span className="hint">Next: sign in with Microsoft via Atlassian.</span>
            <button
              type="button"
              className="btn primary"
              disabled={!activeCompanyId}
              onClick={() => goTo(2)}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="stage" key="step-2">
          <div className="stage-head">
            <p className="stage-kicker">Step 2</p>
            <h2>Sign in so tickets are created as you</h2>
            <p>
              Use Atlassian OAuth, then choose Microsoft on their screen. This app
              never sees your password.
            </p>
          </div>
          <div className="soft-panel auth-panel">
            {signedIn ? (
              <>
                <p className="status-line ok">
                  Connected
                  {authStatus?.connection?.oauthSiteName
                    ? ` to ${authStatus.connection.oauthSiteName}`
                    : ""}
                  .
                </p>
                <p className="muted">You’re ready to create, update, and move tickets.</p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                  <button type="button" className="btn primary" onClick={() => goTo(3)}>
                    Choose a task
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  {authStatus?.oauthAppConfigured
                    ? "Not signed in yet. You can still prepare a copy/paste pack."
                    : "OAuth app not configured yet. Add ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET, then restart."}
                </p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !authStatus?.oauthAppConfigured}
                    onClick={() => startSignIn()}
                  >
                    Sign in with Microsoft
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      chooseTask("paste");
                      goTo(3);
                    }}
                  >
                    Skip for now (copy/paste)
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="nav-row">
            <button type="button" className="btn ghost" onClick={() => goTo(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!signedIn && task !== "paste"}
              onClick={() => goTo(3)}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="stage" key="step-3">
          <div className="stage-head">
            <p className="stage-kicker">Step 3</p>
            <h2>What do you want to do?</h2>
            <p>One job at a time. Pick a task, then we’ll show only what you need.</p>
          </div>
          <div className="task-grid">
            {TASKS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`task-card ${task === item.id ? "selected" : ""}`}
                onClick={() => chooseTask(item.id)}
              >
                <strong>{item.title}</strong>
                <span>{item.description}</span>
                <em>{item.hint}</em>
              </button>
            ))}
          </div>
          <div className="nav-row">
            <button type="button" className="btn ghost" onClick={() => goTo(2)}>
              Back
            </button>
            <button type="button" className="btn primary" onClick={() => goTo(4)}>
              Continue to {selectedTask.title.toLowerCase()}
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="stage" key="step-4">
          <div className="stage-head">
            <p className="stage-kicker">Step 4 · {selectedTask.title}</p>
            <h2>{selectedTask.description}</h2>
            <p>{selectedTask.hint}</p>
          </div>

          {(task === "brief" || task === "update" || task === "paste") && (
            <div className="work-form">
              {task === "update" && (
                <label className="field">
                  <span>Existing Jira key to update</span>
                  <input
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value.toUpperCase())}
                    placeholder="e.g. WEB-123"
                  />
                </label>
              )}
              <label className="field">
                <span>Your brief</span>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={7}
                  placeholder="What needs to happen? Who is it for? Any constraints or AC you already know?"
                />
              </label>
              <label className="field">
                <span>Attach notes (optional)</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv"
                  onChange={(e) => void onFileChange(e.target.files)}
                />
              </label>
              {files.length > 0 && (
                <p className="muted">{files.length} note file(s) staged</p>
              )}
              {(task === "brief" || task === "update") && signedIn && (
                <div className="field-row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={moveAfterCreate}
                      onChange={(e) => setMoveAfterCreate(e.target.checked)}
                    />
                    After create, try moving to
                  </label>
                  <label className="field">
                    <span>Status</span>
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
                        ]
                      ).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <div className="nav-row">
                <button type="button" className="btn ghost" onClick={() => goTo(3)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !input.trim()}
                  onClick={() => void sendBrief()}
                >
                  {busy ? "Working…" : "Research & draft"}
                </button>
              </div>
            </div>
          )}

          {task === "bulk" && (
            <div className="work-form">
              <label className="field">
                <span>Playbook</span>
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
              <p className="muted">
                {activeCompany?.playbooks.find((p) => p.id === playbookId)?.description}
              </p>
              {signedIn && (
                <div className="field-row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={moveAfterCreate}
                      onChange={(e) => setMoveAfterCreate(e.target.checked)}
                    />
                    After create, try moving to
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      value={postCreateStatus}
                      disabled={!moveAfterCreate}
                      onChange={(e) => setPostCreateStatus(e.target.value)}
                    >
                      {(activeCompany?.workflow.commonStatuses || ["In Analysis"]).map(
                        (status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
              )}
              <label className="field">
                <span>Upload Excel or CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => void onFileChange(e.target.files)}
                />
              </label>
              {playbookId === "configurator-design-sections" && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void runBulk()}
                >
                  Draft design tickets from knowledge
                </button>
              )}
              <div className="nav-row">
                <button type="button" className="btn ghost" onClick={() => goTo(3)}>
                  Back
                </button>
                <span className="hint">
                  Upload drafts tickets first. You’ll create them on the next step.
                </span>
              </div>
            </div>
          )}

          {task === "move" && (
            <div className="work-form">
              <label className="field">
                <span>Jira issue key</span>
                <input
                  value={transitionKey}
                  onChange={(e) => setTransitionKey(e.target.value.toUpperCase())}
                  placeholder="e.g. FIELD-45"
                />
              </label>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !transitionKey.trim() || !signedIn}
                  onClick={() => void loadTransitions()}
                >
                  Show allowed moves
                </button>
              </div>
              {(availableTransitions.length > 0 || currentStatus) && (
                <>
                  <p className="muted">Current status: {currentStatus || "unknown"}</p>
                  <label className="field">
                    <span>Target status shortcut</span>
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
                  </label>
                  <label className="field">
                    <span>Allowed transition</span>
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
                  </label>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy || !signedIn}
                      onClick={() => void applyTransition(false)}
                    >
                      Preview move
                    </button>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={transitionConfirm}
                      onChange={(e) => setTransitionConfirm(e.target.checked)}
                    />
                    I confirm this status move for {transitionKey}
                  </label>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={
                      busy || !signedIn || !transitionConfirm || !selectedTransitionId
                    }
                    onClick={() => void applyTransition(true)}
                  >
                    Move ticket
                  </button>
                </>
              )}
              <div className="nav-row">
                <button type="button" className="btn ghost" onClick={() => goTo(3)}>
                  Back
                </button>
                {!signedIn && (
                  <span className="hint">Sign in first to move ticket status.</span>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {step === 5 && (
        <section className="stage" key="step-5">
          <div className="stage-head">
            <p className="stage-kicker">Step 5 · Review</p>
            <h2>Check the result, then take the final action</h2>
            <p>Create/update only when the draft looks right. Status moves stay confirm-gated.</p>
          </div>

          {draft && (
            <article className="result-card">
              <h3>{draft.summary}</h3>
              <p className="meta">
                {draft.projectKey}
                {draft.confidence
                  ? ` · ${Math.round(draft.confidence * 100)}% confidence`
                  : ""}
                {draft.missingFields?.length
                  ? ` · Gaps: ${draft.missingFields.join(", ")}`
                  : ""}
              </p>
              <pre className="body-preview">
                {preview || "No preview yet."}
              </pre>
              <div className="btn-row">
                {(task === "brief" || task === "bulk") && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !signedIn || (task === "bulk" && !bulkDrafts.length)}
                    onClick={() =>
                      void (task === "bulk" ? createBulkDrafts() : createTicket())
                    }
                  >
                    {busy
                      ? "Working…"
                      : task === "bulk"
                        ? `Create ${bulkDrafts.length} in Jira`
                        : "Create in Jira as me"}
                  </button>
                )}
                {task === "update" && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !signedIn || !editKey.trim()}
                    onClick={() => void updateTicket()}
                  >
                    {busy ? "Working…" : `Update ${editKey || "issue"} as me`}
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!draft}
                  onClick={() =>
                    draft && void copyText("summary", draftSummaryForPaste(draft))
                  }
                >
                  Copy summary
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!draft}
                  onClick={() =>
                    draft &&
                    void copyText("description", draftDescriptionForPaste(draft))
                  }
                >
                  Copy description
                </button>
                {bulkDrafts.length > 0 && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => downloadBulkPack()}
                  >
                    Download paste pack
                  </button>
                )}
              </div>
            </article>
          )}

          {research && (research.jiraHits.length > 0 || research.confluenceHits.length > 0) && (
            <article className="result-card soft">
              <h3>Research used</h3>
              <ul className="research-list">
                {research.jiraHits.slice(0, 5).map((hit) => (
                  <li key={hit.id}>
                    <strong>Jira</strong> · {hit.title}
                    <span>{hit.id}</span>
                  </li>
                ))}
                {research.confluenceHits.slice(0, 4).map((hit) => (
                  <li key={`c-${hit.id}`}>
                    <strong>Confluence</strong> · {hit.title}
                  </li>
                ))}
              </ul>
            </article>
          )}

          {bulkSummaries.length > 0 && (
            <article className="result-card">
              <h3>Bulk queue ({bulkSummaries.length})</h3>
              <ul className="bulk-list">
                {bulkSummaries.slice(0, 20).map((line) => (
                  <li key={line}>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {messages.slice(-3).map((message) => (
            <article key={message.id} className="result-card soft">
              <p className="muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {message.content}
              </p>
            </article>
          ))}

          <div className="nav-row">
            <button type="button" className="btn ghost" onClick={() => goTo(4)}>
              Back to work
            </button>
            <button type="button" className="btn primary" onClick={() => startAnotherTask()}>
              Start another task
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
