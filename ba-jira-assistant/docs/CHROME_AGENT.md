# Ticket Flow Chrome Agent (recommended)

Use an **AI agent inside Chrome** that acts with **your already-logged-in Jira session**.  
No API token. No Cursor plugin required. Company accounts (Christie's, McLaren, others) switch in the side panel.

## Why this path

Corporate Jira (Christie's, McLaren, …) already has Microsoft SSO in the browser.  
A Chrome extension can call Jira REST **from the open Jira tab**, so cookies / SSO session are reused safely.

| Piece | Role |
|---|---|
| Chrome side panel | Chat agent + account switcher |
| Content script on `*.atlassian.net` | Runs tools using your session |
| Built-in tools | Draft, create, search, read, list transitions, move status, paste pack |
| Next.js app (optional) | Heavier bulk Excel / local playbooks if you still want a website |

## Install (Load unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select  
   `ba-jira-assistant/chrome-extension`
4. Pin **Ticket Flow Agent**
5. Log into the company Jira site in a normal tab
6. Click the extension icon → side panel opens

## Daily use

1. Open Christie's or McLaren Jira (logged in)
2. Pick the matching **Account** on the left (or **+ Add**)
3. Click **Check login** once
4. Paste a brief → agent drafts
5. Say `create confirm` → creates **as you**
6. Optional: `move BAU-123 to In Analysis confirm`

### Example prompts

- `Buyers need to save a lot from search. Epic: Discovery.`
- `create confirm`
- `search calendar`
- `read BAU-45`
- `move BAU-45 to In Analysis confirm`
- `switch McLaren`
- `add account Acme` (then set default project when prompted via + Add form)

## Tools (outside Cursor)

These run in Chrome, not in the Cursor agent plugin:

- `detect_session` — who you’re logged in as
- `list_accounts` / `switch_account` / `add_account`
- `draft_ticket` / `create_ticket` / `copy_paste_pack`
- `search_jira` / `read_issue`
- `list_transitions` / `move_status`

## Safety

- Never asks for your Microsoft password
- Create / status moves require an explicit **confirm**
- No delete tool
- Each company account keeps its own defaults (project, SCO prefix, In Analysis, …)

## Relationship to the web app

The Next.js “Ticket Flow” site remains useful for bulk spreadsheet playbooks and OAuth experiments.  
For day-to-day BA work while already in Jira, prefer this Chrome agent.
