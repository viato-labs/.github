/** Tool definitions the agent can call (outside Cursor). */

export const TOOLS = [
  {
    name: "detect_session",
    description: "Detect the active Jira tab, site host, and logged-in user.",
  },
  {
    name: "list_accounts",
    description: "List company accounts (Christie's, McLaren, custom).",
  },
  {
    name: "switch_account",
    description: "Switch the active company account by id or name.",
    params: ["account"],
  },
  {
    name: "add_account",
    description: "Add a new company account.",
    params: ["name", "projectKey?"],
  },
  {
    name: "draft_ticket",
    description: "Draft a Christie's-style ticket from a brief.",
    params: ["brief"],
  },
  {
    name: "create_ticket",
    description: "Create the current draft in Jira using your Chrome login session.",
    params: ["confirm"],
  },
  {
    name: "search_jira",
    description: "Search Jira (JQL or text) using your session.",
    params: ["query"],
  },
  {
    name: "read_issue",
    description: "Read an issue by key, or the issue open in the active tab.",
    params: ["issueKey?"],
  },
  {
    name: "list_transitions",
    description: "List allowed status transitions for an issue.",
    params: ["issueKey"],
  },
  {
    name: "move_status",
    description: "Move an issue to a target status (confirm required).",
    params: ["issueKey", "status", "confirm"],
  },
  {
    name: "copy_paste_pack",
    description: "Build a copy/paste pack from the current draft.",
  },
];

export function toolHelp() {
  return TOOLS.map(
    (tool) =>
      `• ${tool.name}${tool.params?.length ? ` (${tool.params.join(", ")})` : ""} — ${tool.description}`,
  ).join("\n");
}
