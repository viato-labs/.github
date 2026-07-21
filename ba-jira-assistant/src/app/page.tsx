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
  TicketDraft,
} from "@/lib/types";

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
  const [showCompanies, setShowCompanies] = useState(false);
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

  useEffect(() => {
    void (async () => {
      const companyId = await refreshCompanies();
      const companyRes = await fetch(`/api/chat?companyId=${companyId}`);
      const companyData = await companyRes.json();
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: `Working in **${companyData.company.name}**. There is no in-app SSO login. Sign into Jira with Microsoft in your browser, draft here, then copy/paste to create or edit tickets. Knowledge stays isolated per company.`,
        },
      ]);
      const defaultPlaybook =
        (companyData.company.playbooks?.[0]?.id as PlaybookId) || "single-brief";
      setPlaybookId(defaultPlaybook);
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
          content: `Switched to **${company?.name || companyId}**. Sign into that company's Jira with Microsoft separately, then paste drafts there.`,
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
          content: `${data.reply}\n\nNext: copy summary + description into Jira while signed in with Microsoft.`,
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
          content: `Prepared **${data.draftCount}** drafts for **${data.company.name}**. Download the paste pack or copy each ticket into Jira under Microsoft SSO.`,
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
      setLastResult(`Added company ${data.company.name}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <h1 className="brand">BA Jira Assistant</h1>
      <p className="lede">
        Draft authentic tickets from company knowledge and files. You stay signed
        into Jira with Microsoft yourself — this app does not connect SSO or create
        tickets for you.
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
        <span className="chip" data-tone="ok">
          {activeCompany?.name || "Company"}: draft → copy/paste into Jira
          (Microsoft SSO in browser)
        </span>
        {activeCompany ? (
          <span className="chip">
            Memory: {activeCompany.memoryStats.historicalTickets} refs ·{" "}
            {activeCompany.memoryStats.briefs} briefs
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
          <button className="primary" disabled={busy} onClick={() => downloadBulkPack()}>
            Download bulk paste pack
          </button>
        ) : null}
      </div>

      {showCompanies ? (
        <section className="panel" style={{ marginTop: "1rem", minHeight: 0 }}>
          <div className="panel-header">Company workspaces</div>
          <div className="composer">
            <p className="file-row">
              Each company keeps its own knowledge base. Jira login stays in your
              browser via Microsoft — never entered here.
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
            <div className="actions">
              <button
                className="primary"
                disabled={busy || !input.trim()}
                onClick={() => void sendBrief()}
              >
                Draft from brief
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
              <button
                disabled={!draft}
                onClick={() => draft && void copyText("full ticket", preview)}
              >
                Copy full ticket
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
            <div>
              Your login: Jira in the browser with Microsoft. Then paste summary +
              description into New issue / Edit.
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
        No in-app SSO. Workflow: Microsoft login in Jira → draft here → copy/paste.
        Details in <code>docs/CORPORATE_SSO.md</code>.
      </p>
    </main>
  );
}
