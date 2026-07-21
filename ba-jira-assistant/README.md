# BA Jira Assistant

Multi-company, chat-driven helper that turns a short BA brief (or Excel/CSV) into consistent Jira tickets:

1. **Product Overview**
2. **Description** (clear instructions for developers)
3. **Technical Information** (blank outline for developers)
4. **QA Acceptance Criteria** in **Gherkin** (`Given` / `When` / `Then`) when relevant
5. **Definition of Ready** table (company house standard)

Each company workspace (Christie's, McLaren, …) stores its own Jira login, boards, glossary, epics, DoR, and history — no cross-client bleed.

> Investigation: [`docs/FEASIBILITY.md`](./docs/FEASIBILITY.md)  
> Multi-company model: [`docs/MULTI_COMPANY.md`](./docs/MULTI_COMPANY.md)

## Quick start

```bash
cd ba-jira-assistant
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without credentials the app stays in **dry-run** and still drafts full previews.

## Multi-company usage

1. Switch company in the header (seeded: **Christie's**, **McLaren**)
2. Optionally add that company's Jira API token login
3. Choose a playbook:
   - `single-brief` — one chat brief → one ticket
   - `bulk-rows` — each spreadsheet row → one ticket
   - `field-trip-by-engagement` — Christie's engagement sheet → field tickets
   - `configurator-design-sections` — McLaren design tickets per section
4. Paste a brief **or** upload Excel/CSV
5. Review confidence + preview → create

## Access modes (important for corporate accounts)

Corporate Jira is usually **Microsoft SSO only** — no API tokens. See [`docs/CORPORATE_SSO.md`](./docs/CORPORATE_SSO.md).

1. **Manual (default):** draft here → copy summary/description → create in Jira while signed in with Microsoft
2. **OAuth SSO (later):** browser “Sign in with Microsoft/Atlassian” if IT approves an OAuth app
3. **API token (optional):** only if a client actually allows it

Do **not** share Microsoft passwords with the assistant.

Optional token setup (rare): UI login panel or `POST /api/companies/credentials`. Secrets stay under `.data/workspaces/<slug>/secrets.json` (gitignored).

## Example briefs

Christie's:

```text
Buyers need to save a lot from search results on web.
Epic: Discovery
Priority: High
Users can save and see it in My Lots.
```

McLaren knowledge bulk:

1. Select McLaren
2. Playbook: Configurator design sections
3. Click **Draft design tickets from knowledge**

## API surface

| Route | Purpose |
|---|---|
| `GET/POST/PATCH /api/companies` | List / add / switch company |
| `POST /api/companies/credentials` | Save per-company Jira login |
| `POST /api/chat` | Store brief + draft ticket |
| `POST /api/tickets/preview` | Markdown preview |
| `POST /api/tickets/create` | Create one or many drafts |
| `POST /api/tickets/bulk` | Spreadsheet / knowledge playbooks |
| `POST /api/tickets/harvest-dor` | Pull DoR table from a golden ticket |
| `GET/PATCH /api/context` | Company memory updates |
| `GET /api/jira/status` | Connection / dry-run status |

## Important constraints

- One login + knowledge base per company — never mix client standards
- Prefer API token / OAuth / service account — not SSO password sharing
- Company-managed Jira may need Epic Link `customfield_#####` calibration
- For Cursor-native create/search, prefer org-approved / Runlayer-managed MCP over ad-hoc shadow MCPs
