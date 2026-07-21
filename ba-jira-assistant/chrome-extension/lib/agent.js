import { toolHelp } from "./tools.js";

export async function runAgentTurn({ text, context, executeTool }) {
  const input = String(text || "").trim();
  if (!input) {
    return {
      reply:
        "Drop guidance, a Figma/Confluence link, or say research & draft. I’ll write tickets like you.",
    };
  }
  const lower = input.toLowerCase();

  if (/^(help|tools)\b/.test(lower)) {
    return { reply: "Chrome tools (no Cursor needed):\n" + toolHelp() };
  }

  if (/\bopen jira\b/.test(lower)) {
    const result = await executeTool("open_jira", {});
    return { reply: result.message, data: result };
  }

  if (/\b(switch|use)\b.+\b(account|company|christie|mclaren)\b/.test(lower)) {
    const account = input.match(/(?:switch|use)\s+(?:to\s+)?(.+)$/i)?.[1]?.trim();
    const result = await executeTool("switch_account", { account });
    return { reply: result.message, data: result };
  }

  if (/\bcreate\b/.test(lower) && context.drafts?.length) {
    if (!/\bconfirm\b/i.test(input)) {
      return {
        reply: `Ready to create ${context.drafts.length} ticket(s) as you. Say: create confirm`,
      };
    }
    const result = await executeTool("create_tickets", { confirm: true });
    return { reply: result.message, data: result };
  }

  // Default: treat message as guidance
  const result = await executeTool("draft_from_guidance", {
    guidance: input,
    links: context.links || [],
    audience: context.audience || "both",
  });
  return {
    reply: result.message,
    data: result,
    drafts: result.drafts,
  };
}
