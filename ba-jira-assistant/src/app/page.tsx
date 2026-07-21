"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ChatMessage,
  CompanySummary,
  PlaybookId,
  TicketDraft,
} from "@/lib/types";

type JiraStatus = {
  ok: boolean;
  dryRun: boolean;
  message: string;
  companyName?: string;
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
  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({
    baseUrl: "",
    email: "",
    apiToken: "",
    dryRun: true,
  });
  const [newCompanyName, setNewCompanyName] = useState("");

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId],
  );

  async function refreshCompanies(preferredId?: string) {
    const response = await fetch("/api/companies");
    const data = await response.json();
    setCompanies(data.companies || []);
    const nextId = preferredId || data.activeCompanyId;
    setActiveCompanyId(nextId);
    return nextId as string;
  }

  async function refreshStatus(companyId: string) {
    const response = await fetch(`/api/jira/status?companyId=${companyId}`);
    const data = await response.json();
    setStatus(data);
  }

  useEffect(() => {
    void (async () => {
      const companyId = await refreshCompanies();
      await refreshStatus(companyId);
      const companyRes = await fetch(`/api/chat?companyId=${companyId}`);
      const companyData = await companyRes.json();
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: `Working in **${companyData.company.name}**. Knowledge, boards, and Jira login are isolated per company. Paste a brief, or upload Excel/CSV and pick a playbook (e.g. Christie's field-trip-by-engagement, McLaren configurator-design-sections).`,
        },
      ]);
      const defaultPlaybook =
        (companyData.company.playbooks?.[0]?.id as PlaybookId) || "single-brief";
      setPlaybookId(defaultPlaybook);
    })();
  }, []);

  const statusTone = useMemo(() => {
    if (!status) return "warn";
    if (status.ok && !status.dryRun) return "ok";
    return "warn";
  }, [status]);

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
      await refreshStatus(companyId);
      setDraft(null);
      setBulkDrafts([]);
      setBulkSummaries([]);
      setPreview("");
      const company = nextCompanies.find((c) => c.id === companyId);
      setPlaybookId(
        (company?.playbooks?.[0]?.id as PlaybookId) || "single-brief",
      );
      setMessages([
        {
          id: uid(),
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: `Switched to **${company?.name || companyId}**. Prior company knowledge stays sealed in its own workspace.`,
        },
      ]);
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
      setBulkDrafts([]);
      setBulkSummaries([]);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: data.reply,
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
        body: JSON.stringify({ draft, companyId: activeCompanyId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Create failed");
        return;
      }
      const result = data.result;
      setLastResult(
        `${result.dryRun ? "Dry-run" : "Created"} ${result.key} @ ${data.company.name}`,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `${result.dryRun ? "Dry-run ticket" : "Created Jira issue"} **${result.key}** in ${data.company.name}.`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPreview(result.previewMarkdown || preview);
      await refreshCompanies(activeCompanyId);
    } catch {
      setLastResult("Create request failed");
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
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Bulk create failed");
        return;
      }
      const createdCount = data.results?.length || 0;
      const dryRun = data.results?.[0]?.dryRun;
      setLastResult(
        `${createdCount} ticket(s) ${dryRun ? "dry-run" : "created"} for ${data.company.name}`,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `Bulk ${dryRun ? "dry-run" : "create"} complete for **${data.company.name}**: ${createdCount} tickets.`,
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
          content: `Prepared **${data.draftCount}** drafts for **${data.company.name}** using playbook \`${data.playbookId}\`. Review, then create.`,
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

  async function saveLogin() {
    if (!activeCompanyId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/companies/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, ...loginForm }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Login save failed");
        return;
      }
      await refreshCompanies(activeCompanyId);
      await refreshStatus(activeCompanyId);
      setShowLogin(false);
      setLastResult(`Saved Jira login for ${data.company.name}`);
    } finally {
      setBusy(false);
    }
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
      await refreshStatus(data.company.id);
      setLastResult(`Added company ${data.company.name}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <h1 className="brand">BA Jira Assistant</h1>
      <p className="lede">
        Multi-company ticket studio. Each client (Christie&apos;s, McLaren, …)
        keeps its own Jira login, boards, DoR, glossary, and history — so tickets
        stay authentic to that organisation with minimal supervision.
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
          {status?.message || "Checking Jira connection…"}
        </span>
        {activeCompany ? (
          <span className="chip">
            Memory: {activeCompany.memoryStats.historicalTickets} refs ·{" "}
            {activeCompany.memoryStats.briefs} briefs ·{" "}
            {activeCompany.memoryStats.createdTickets} created
          </span>
        ) : null}
        {draft ? (
          <span className="chip">
            Draft confidence {Math.round(draft.confidence * 100)}%
          </span>
        ) : null}
        {lastResult ? <span className="chip">{lastResult}</span> : null}
      </div>

      <div className="actions" style={{ marginTop: "0.85rem" }}>
        <button disabled={busy} onClick={() => setShowLogin((v) => !v)}>
          {showLogin ? "Hide company login" : "Add / update company Jira login"}
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
          <button
            className="primary"
            disabled={busy}
            onClick={() => void createBulkDrafts()}
          >
            Create all drafted bulk tickets
          </button>
        ) : null}
      </div>

      {showLogin ? (
        <section className="panel" style={{ marginTop: "1rem", minHeight: 0 }}>
          <div className="panel-header">
            Jira login for {activeCompany?.name || "company"}
          </div>
          <div className="composer">
            <input
              placeholder="https://company.atlassian.net"
              value={loginForm.baseUrl}
              onChange={(e) =>
                setLoginForm((prev) => ({ ...prev, baseUrl: e.target.value }))
              }
            />
            <input
              placeholder="email@company.com"
              value={loginForm.email}
              onChange={(e) =>
                setLoginForm((prev) => ({ ...prev, email: e.target.value }))
              }
            />
            <input
              placeholder="API token (not password)"
              type="password"
              value={loginForm.apiToken}
              onChange={(e) =>
                setLoginForm((prev) => ({ ...prev, apiToken: e.target.value }))
              }
            />
            <label className="file-row">
              <input
                type="checkbox"
                checked={loginForm.dryRun}
                onChange={(e) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    dryRun: e.target.checked,
                  }))
                }
              />
              Dry-run (recommended until house style is trusted)
            </label>
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => void saveLogin()}>
                Save login for this company only
              </button>
            </div>
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
            <div className="actions">
              <button
                className="primary"
                disabled={busy || !input.trim()}
                onClick={() => void sendBrief()}
              >
                Draft from brief
              </button>
              <button disabled={busy || !draft} onClick={() => void createTicket()}>
                Create current ticket
              </button>
            </div>
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
        Objective: give key parameters or a file, and let company-scoped history
        write tickets to BA standard without babysitting. Christie&apos;s example:
        Excel → playbook <code>field-trip-by-engagement</code> → one ticket per
        row. McLaren example: playbook{" "}
        <code>configurator-design-sections</code> → design tickets per known
        section. See <code>docs/FEASIBILITY.md</code> and{" "}
        <code>docs/MULTI_COMPANY.md</code>.
      </p>
    </main>
  );
}
