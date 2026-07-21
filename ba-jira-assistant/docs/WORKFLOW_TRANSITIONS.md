# Workflow status transitions

## Safety model

- The app **never invents** a status change.
- It asks Jira for **allowed transitions** for that issue (`/transitions`).
- It only moves a ticket if a matching allowed transition exists.
- Manual moves require **Preview** then **Confirm**.
- There is still **no delete** path.

## Christie's default

- Post-create target: **In Analysis**
- Enabled by default for create + bulk create
- If the workflow does not allow that move from the created status, the create still succeeds and the transition result explains why

## APIs

- `GET /api/tickets/transitions?issueKey=FIELD-1&companyId=...`
- `POST /api/tickets/transitions` with `{ issueKey, targetStatus, confirm }`
- `POST /api/tickets/create` with optional `transitionToStatus: "In Analysis"` (or `null` to skip)

## UI

1. Checkbox: After create, move to [status]
2. For existing tickets: enter key → Load allowed statuses → Preview → Confirm
