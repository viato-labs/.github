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
    <div className="shell">
      <header className="ribbon">
        <div className="ribbon-brand">
          <strong>Ticket Flow</strong>
          <span>
            {activeCompany?.name || "BA workspace"}
          </span>
        </div>
        <div className="ribbon-status" aria-live="polite">
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

      {lastResult ? (
        <div
          className={`toast ${/fail|wrong|could not|error/i.test(lastResult) ? "error" : "ok"}`}
          role="status"
        >
          {lastResult}
        </div>
      ) : null}

      <main className="frame">
        {step === 1 && (
          <section className="hero" aria-label="Welcome">
            <p className="hero-brand">Ticket Flow</p>
            <h1>From brief to Jira, calmly.</h1>
            <p>
              One step at a time. Sign in as you, draft with research, then create —
              without the clutter of the board.
            </p>
          </section>
        )}

        <nav className="progress" aria-label="Progress">
          {([1, 2, 3, 4, 5] as WizardStep[]).map((item, index) => (
            <span key={item} style={{ display: "contents" }}>
              {index > 0 ? <span className="progress-sep" aria-hidden /> : null}
              <button
                type="button"
                data-active={step === item}
                data-done={step > item}
                onClick={() => {
                  if (item <= step || (item === 5 && hasReview)) goTo(item);
                  else if (item >= 2 && activeCompanyId) goTo(item as WizardStep);
                }}
              >
                {stepLabel(item)}
              </button>
            </span>
          ))}
        </nav>

        {step === 1 && (
          <section className="stage" key="step-1">
            <div className="stage-head">
              <p className="kicker">Step 1</p>
              <h2>Choose your company</h2>
              <p>Each workspace keeps Jira, playbooks, and memory sealed.</p>
            </div>

            <div className="group">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className="row"
                  data-selected={activeCompanyId === company.id}
                  disabled={busy}
                  onClick={() => void switchCompany(company.id)}
                >
                  <span className="row-copy">
                    <strong>{company.name}</strong>
                    <span>
                      {company.boards.map((b) => b.projectKey).join(" · ") ||
                        "No boards yet"}
                    </span>
                  </span>
                  <span className="check-mark" aria-hidden>
                    ✓
                  </span>
                </button>
              ))}
            </div>

            <div className="stack" style={{ marginTop: "1.25rem" }}>
              <label className="field">
                <span>Add another company</span>
                <div className="field-row">
                  <input
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Company name"
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy || !newCompanyName.trim()}
                    onClick={() => void addCompany()}
                  >
                    Add
                  </button>
                </div>
              </label>
            </div>

            <div className="actions spread">
              <span className="hint">Next: sign in with Microsoft</span>
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
              <p className="kicker">Step 2</p>
              <h2>Sign in as yourself</h2>
              <p>
                Atlassian opens, then Microsoft SSO. Your password never enters this app.
              </p>
            </div>

            <div className="group">
              <div className="row" style={{ cursor: "default" }}>
                <span className="row-copy">
                  <strong>
                    {signedIn
                      ? "Connected"
                      : authStatus?.oauthAppConfigured
                        ? "Ready to connect"
                        : "OAuth not configured"}
                  </strong>
                  <span>
                    {signedIn
                      ? authStatus?.connection?.oauthSiteName ||
                        "Jira will create tickets as you"
                      : authStatus?.oauthAppConfigured
                        ? "Use Microsoft on the Atlassian screen"
                        : "Add ATLASSIAN_CLIENT_ID and SECRET, then restart"}
                  </span>
                </span>
                <span className={`status-pill`}>{signedIn ? "Live" : "Idle"}</span>
              </div>
            </div>

            <div className="actions">
              {signedIn ? (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                  <button type="button" className="btn primary" onClick={() => goTo(3)}>
                    Choose a task
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn linkish"
                    onClick={() => {
                      chooseTask("paste");
                      goTo(3);
                    }}
                  >
                    Skip · copy/paste
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !authStatus?.oauthAppConfigured}
                    onClick={() => startSignIn()}
                  >
                    Sign in with Microsoft
                  </button>
                </>
              )}
            </div>

            <div className="actions spread">
              <button type="button" className="btn linkish" onClick={() => goTo(1)}>
                Back
              </button>
              <button
                type="button"
                className="btn secondary"
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
              <p className="kicker">Step 3</p>
              <h2>What do you need?</h2>
              <p>Pick one job. We’ll hide everything else.</p>
            </div>

            <div className="group">
              {TASKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="row"
                  data-selected={task === item.id}
                  onClick={() => chooseTask(item.id)}
                >
                  <span className="row-copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                    <em>{item.hint}</em>
                  </span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </button>
              ))}
            </div>

            <div className="actions spread">
              <button type="button" className="btn linkish" onClick={() => goTo(2)}>
                Back
              </button>
              <button type="button" className="btn primary" onClick={() => goTo(4)}>
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="stage" key="step-4">
            <div className="stage-head">
              <p className="kicker">Step 4</p>
              <h2>{selectedTask.title}</h2>
              <p>{selectedTask.description}</p>
            </div>

            {(task === "brief" || task === "update" || task === "paste") && (
              <div className="stack">
                {task === "update" && (
                  <label className="field">
                    <span>Issue key</span>
                    <input
                      value={editKey}
                      onChange={(e) => setEditKey(e.target.value.toUpperCase())}
                      placeholder="WEB-123"
                    />
                  </label>
                )}
                <label className="field">
                  <span>Brief</span>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={7}
                    placeholder="What should happen, for whom, and how we’ll know it’s done?"
                  />
                </label>
                <label className="field">
                  <span>Notes (optional)</span>
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.csv"
                    onChange={(e) => void onFileChange(e.target.files)}
                  />
                </label>
                {files.length > 0 && (
                  <p className="muted">{files.length} note file(s) attached</p>
                )}
                {(task === "brief" || task === "update") && signedIn && (
                  <div className="field-row">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={moveAfterCreate}
                        onChange={(e) => setMoveAfterCreate(e.target.checked)}
                      />
                      After create, move to
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
                <div className="actions spread">
                  <button type="button" className="btn linkish" onClick={() => goTo(3)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !input.trim()}
                    onClick={() => void sendBrief()}
                  >
                    {busy ? "Working…" : "Draft ticket"}
                  </button>
                </div>
              </div>
            )}

            {task === "bulk" && (
              <div className="stack">
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
                  {
                    activeCompany?.playbooks.find((p) => p.id === playbookId)
                      ?.description
                  }
                </p>
                {signedIn && (
                  <div className="field-row">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={moveAfterCreate}
                        onChange={(e) => setMoveAfterCreate(e.target.checked)}
                      />
                      After create, move to
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={postCreateStatus}
                        disabled={!moveAfterCreate}
                        onChange={(e) => setPostCreateStatus(e.target.value)}
                      >
                        {(
                          activeCompany?.workflow.commonStatuses || ["In Analysis"]
                        ).map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <label className="field">
                  <span>Excel or CSV</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => void onFileChange(e.target.files)}
                  />
                </label>
                {playbookId === "configurator-design-sections" && (
                  <div className="actions">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() => void runBulk()}
                    >
                      Draft from knowledge
                    </button>
                  </div>
                )}
                <div className="actions spread">
                  <button type="button" className="btn linkish" onClick={() => goTo(3)}>
                    Back
                  </button>
                  <span className="hint">Upload to draft, then review</span>
                </div>
              </div>
            )}

            {task === "move" && (
              <div className="stack">
                <label className="field">
                  <span>Issue key</span>
                  <input
                    value={transitionKey}
                    onChange={(e) => setTransitionKey(e.target.value.toUpperCase())}
                    placeholder="FIELD-45"
                  />
                </label>
                <div className="actions">
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
                    <div className="group">
                      <div className="row" style={{ cursor: "default" }}>
                        <span className="row-copy">
                          <strong>Current status</strong>
                          <span>{currentStatus || "Unknown"}</span>
                        </span>
                        <span className="status-pill">{currentStatus || "—"}</span>
                      </div>
                    </div>
                    <label className="field">
                      <span>Target</span>
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
                    <div className="actions">
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy || !signedIn}
                        onClick={() => void applyTransition(false)}
                      >
                        Preview
                      </button>
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={transitionConfirm}
                        onChange={(e) => setTransitionConfirm(e.target.checked)}
                      />
                      Confirm move for {transitionKey}
                    </label>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={
                          busy ||
                          !signedIn ||
                          !transitionConfirm ||
                          !selectedTransitionId
                        }
                        onClick={() => void applyTransition(true)}
                      >
                        Move ticket
                      </button>
                    </div>
                  </>
                )}
                <div className="actions spread">
                  <button type="button" className="btn linkish" onClick={() => goTo(3)}>
                    Back
                  </button>
                  {!signedIn && <span className="hint">Sign in to move status</span>}
                </div>
              </div>
            )}
          </section>
        )}

        {step === 5 && (
          <section className="stage" key="step-5">
            <div className="stage-head">
              <p className="kicker">Step 5</p>
              <h2>Review</h2>
              <p>Read it once. Then create, update, or copy.</p>
            </div>

            {draft && (
              <article className="sheet">
                <div className="sheet-top">
                  <div>
                    <h3>{draft.summary}</h3>
                    <p className="meta">
                      {draft.projectKey}
                      {draft.confidence
                        ? ` · ${Math.round(draft.confidence * 100)}% ready`
                        : ""}
                      {draft.missingFields?.length
                        ? ` · Gaps: ${draft.missingFields.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <span className="status-pill">
                    {moveAfterCreate ? postCreateStatus || "Draft" : "Draft"}
                  </span>
                </div>
                <div className="sheet-body">
                  <pre>{preview || "No preview yet."}</pre>
                </div>
                <div className="sheet-actions">
                  {(task === "brief" || task === "bulk") && (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={
                        busy ||
                        !signedIn ||
                        (task === "bulk" && !bulkDrafts.length)
                      }
                      onClick={() =>
                        void (task === "bulk" ? createBulkDrafts() : createTicket())
                      }
                    >
                      {busy
                        ? "Working…"
                        : task === "bulk"
                          ? `Create ${bulkDrafts.length}`
                          : "Create in Jira"}
                    </button>
                  )}
                  {task === "update" && (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy || !signedIn || !editKey.trim()}
                      onClick={() => void updateTicket()}
                    >
                      {busy ? "Working…" : `Update ${editKey || "issue"}`}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!draft}
                    onClick={() =>
                      draft && void copyText("summary", draftSummaryForPaste(draft))
                    }
                  >
                    Copy summary
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
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
                      className="btn secondary"
                      onClick={() => downloadBulkPack()}
                    >
                      Download pack
                    </button>
                  )}
                </div>
              </article>
            )}

            {research &&
              (research.jiraHits.length > 0 || research.confluenceHits.length > 0) && (
                <div className="side-note">
                  <h4>Research</h4>
                  <ul>
                    {research.jiraHits.slice(0, 4).map((hit) => (
                      <li key={hit.id}>
                        <strong>{hit.id}</strong> — {hit.title}
                      </li>
                    ))}
                    {research.confluenceHits.slice(0, 3).map((hit) => (
                      <li key={`c-${hit.id}`}>
                        <strong>Confluence</strong> — {hit.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {bulkSummaries.length > 0 && (
              <div className="side-note">
                <h4>Queue · {bulkSummaries.length}</h4>
                <ul>
                  {bulkSummaries.slice(0, 12).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            {messages.slice(-1).map((message) => (
              <p key={message.id} className="quiet-block">
                {message.content}
              </p>
            ))}

            <div className="actions spread">
              <button type="button" className="btn linkish" onClick={() => goTo(4)}>
                Back
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => startAnotherTask()}
              >
                Start another
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
