import { draftFromBrief, draftToPastePack } from "./draft.js";
import { toolHelp } from "./tools.js";

/**
 * Small intent router — no Cursor dependency.
 * Speaks naturally, calls named tools via the provided executor.
 */
export async function runAgentTurn({ text, context, executeTool }) {
  const input = String(text || "").trim();
  if (!input) {
    return { reply: "Tell me what you need — draft, create, search, or move a ticket." };
  }

  const lower = input.toLowerCase();

  if (/^(help|tools|what can you do)\b/.test(lower)) {
    return {
      reply:
        "I run in Chrome with your logged-in Jira session. Tools:\n" + toolHelp(),
    };
  }

  if (/\b(switch|use)\b.+\b(account|company|christie|mclaren)\b/.test(lower)) {
    const account =
      input.match(/(?:switch|use)\s+(?:to\s+)?(.+)$/i)?.[1]?.trim() || input;
    const result = await executeTool("switch_account", { account });
    return { reply: result.message, data: result };
  }

  if (/\badd\b.+\b(account|company)\b/.test(lower)) {
    const name =
      input.match(/add\s+(?:account|company)\s+(.+)$/i)?.[1]?.trim() || "";
    const result = await executeTool("add_account", { name });
    return { reply: result.message, data: result };
  }

  if (/\b(search|find|look up)\b/.test(lower)) {
    const query =
      input.replace(/^(search|find|look up)\s+(for\s+)?/i, "").trim() || input;
    const result = await executeTool("search_jira", { query });
    return { reply: result.message, data: result };
  }

  if (/\b(read|open|show)\b.+\b([A-Z][A-Z0-9]+-\d+)\b/i.test(input)) {
    const issueKey = input.match(/\b([A-Z][A-Z0-9]+-\d+)\b/i)?.[1];
    const result = await executeTool("read_issue", { issueKey });
    return { reply: result.message, data: result };
  }

  if (/\b(move|transition|status)\b/.test(lower)) {
    const issueKey = input.match(/\b([A-Z][A-Z0-9]+-\d+)\b/i)?.[1];
    const status =
      input.match(/(?:to|toward)\s+([A-Za-z ][A-Za-z ]{1,40})$/i)?.[1]?.trim() ||
      context.account?.defaultPostCreateStatus ||
      "In Analysis";
    if (!issueKey) {
      return { reply: "Which issue key should I move? Example: move BAU-123 to In Analysis" };
    }
    if (!/\bconfirm\b/i.test(input)) {
      const preview = await executeTool("list_transitions", { issueKey });
      return {
        reply:
          `${preview.message}\n\nSay: move ${issueKey} to ${status} confirm`,
        data: preview,
      };
    }
    const result = await executeTool("move_status", {
      issueKey,
      status,
      confirm: true,
    });
    return { reply: result.message, data: result };
  }

  if (/\b(create|publish|submit)\b/.test(lower) && context.draft) {
    if (!/\bconfirm\b/i.test(input)) {
      return {
        reply: `Ready to create **${context.draft.summary}** in ${context.draft.projectKey} as you.\nSay: create confirm`,
      };
    }
    const result = await executeTool("create_ticket", { confirm: true });
    return { reply: result.message, data: result };
  }

  if (/\b(paste|copy pack|clipboard)\b/.test(lower)) {
    if (!context.draft) {
      return { reply: "No draft yet. Paste a brief first, or say draft: …" };
    }
    const pack = draftToPastePack(context.draft);
    return {
      reply: "Paste pack ready — copy it into Jira if you prefer manual create.",
      data: { pastePack: pack },
      pastePack: pack,
    };
  }

  if (/\bdraft\b[:\s]/i.test(lower) || input.length > 40 || context.awaitingBrief) {
    const brief = input.replace(/^draft\s*[:\-]?\s*/i, "").trim();
    const result = await executeTool("draft_ticket", { brief });
    return { reply: result.message, data: result, draft: result.draft };
  }

  // Default: treat as brief if we have an account
  if (context.account) {
    const drafted = draftFromBrief(input, context.account);
    return {
      reply: `Drafted for **${context.account.name}**:\n• ${drafted.summary}\n• ${drafted.projectKey} / ${drafted.issueType}\nSay **create confirm** to publish with your Chrome session, or **paste** for a copy pack.`,
      draft: drafted,
      data: { draft: drafted },
    };
  }

  return {
    reply:
      "Open your company Jira in Chrome (logged in), pick an account on the left, then paste a brief.",
  };
}
