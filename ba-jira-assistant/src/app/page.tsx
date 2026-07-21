"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, TicketDraft } from "@/lib/types";

type JiraStatus = {
  ok: boolean;
  dryRun: boolean;
  message: string;
};

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      createdAt: new Date().toISOString(),
      content:
        "Paste a BA brief (minimal is fine). I will store context, draft a house-style ticket with Product Overview, Description, Technical stub, Gherkin QA, and Definition of Ready, then preview or create it in Jira.",
    },
  ]);
  const [input, setInput] = useState(
    "Buyers need to save a lot from search results on web. Epic: Discovery. Priority: High. Users can save and see it in My Lots.",
  );
  const [files, setFiles] = useState<string[]>([]);
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");

  useEffect(() => {
    fetch("/api/jira/status")
      .then((r) => r.json())
      .then((data: JiraStatus) => setStatus(data))
      .catch(() =>
        setStatus({
          ok: false,
          dryRun: true,
          message: "Could not read Jira status.",
        }),
      );
  }, []);

  const statusTone = useMemo(() => {
    if (!status) return "warn";
    if (status.ok && !status.dryRun) return "ok";
    return "warn";
  }, [status]);

  async function sendBrief() {
    const message = input.trim();
    if (!message || busy) return;
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
        body: JSON.stringify({ message, files }),
      });
      const data = await response.json();
      setDraft(data.draft);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);

      const previewRes = await fetch("/api/tickets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: data.draft }),
      });
      const previewData = await previewRes.json();
      setPreview(previewData.markdown || "");
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
        body: JSON.stringify({ draft }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLastResult(data.error || "Create failed");
        return;
      }
      const result = data.result;
      setLastResult(
        `${result.dryRun ? "Dry-run" : "Created"} ${result.key}. ${
          result.warnings?.join(" ") || ""
        }`,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `${result.dryRun ? "Dry-run ticket" : "Created Jira issue"} **${result.key}**.`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPreview(result.previewMarkdown || preview);
    } catch {
      setLastResult("Create request failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFileChange(fileList: FileList | null) {
    if (!fileList?.length) return;
    const texts: string[] = [];
    for (const file of Array.from(fileList)) {
      const content = await file.text();
      texts.push(`FILE: ${file.name}\n${content}`);
    }
    setFiles((prev) => [...prev, ...texts].slice(-8));
  }

  return (
    <main className="app-shell">
      <h1 className="brand">BA Jira Assistant</h1>
      <p className="lede">
        Minimal BA intake → consistent developer/QA tickets. Gherkin for QA,
        developer technical outline left blank-by-design, Definition of Ready
        copied from your house table and stored for reuse.
      </p>

      <div className="status-row">
        <span className="chip" data-tone={statusTone}>
          {status?.message || "Checking Jira connection…"}
        </span>
        {draft ? (
          <span className="chip">
            Draft: {draft.intent} · {draft.projectKey}
          </span>
        ) : null}
        {lastResult ? <span className="chip">{lastResult}</span> : null}
      </div>

      <div className="workspace">
        <section className="panel">
          <div className="panel-header">Brief chat</div>
          <div className="chat-log" aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className="bubble"
                data-role={message.role}
              >
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
                Attach notes/files{" "}
                <input
                  type="file"
                  multiple
                  onChange={(e) => void onFileChange(e.target.files)}
                />
              </label>
              <span>{files.length ? `${files.length} file(s) staged` : "No files"}</span>
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
                Create in Jira
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">Ticket preview</div>
          <div className="side-meta">
            <div>
              Structure: Product Overview → Description → Technical Information
              → Gherkin QA → Definition of Ready
            </div>
            {draft?.missingFields?.length ? (
              <div>Gaps: {draft.missingFields.join(", ")}</div>
            ) : (
              <div>Gaps: none flagged</div>
            )}
          </div>
          <div className="preview">
            <pre>{preview || "Draft a brief to see the full ticket body."}</pre>
          </div>
        </section>
      </div>

      <p className="hint">
        Do not share a normal Jira password. Use an API token (or OAuth /
        service account). See <code>docs/FEASIBILITY.md</code> for auth options,
        Christie&apos;s-style fidelity, epic mapping, and what to provide for live
        calibration. Assumed QA format: <strong>Gherkin</strong> (Given / When /
        Then).
      </p>
    </main>
  );
}
