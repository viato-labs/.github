/** Tools the Chrome agent can run (no Cursor plugin). */

export const TOOLS = [
  { name: "detect_session", description: "See who you’re logged into Jira as." },
  { name: "open_jira", description: "Open this company’s Jira URL in a tab." },
  { name: "switch_account", description: "Switch Christie's / McLaren / other." },
  { name: "add_account", description: "Add a company with its Jira URL." },
  {
    name: "draft_from_guidance",
    description: "Research context and draft human tickets from guidance + links.",
  },
  {
    name: "create_tickets",
    description: "Create drafted tickets in Jira using your Chrome login (confirm).",
  },
  { name: "search_context", description: "Search Jira + Confluence for related work." },
];

export function toolHelp() {
  return TOOLS.map((t) => `• ${t.name} — ${t.description}`).join("\n");
}
