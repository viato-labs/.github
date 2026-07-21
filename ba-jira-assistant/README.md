# BA Jira Assistant

Chat-driven helper that turns a short BA brief into a consistent Jira ticket body:

1. **Product Overview**
2. **Description** (clear instructions for developers)
3. **Technical Information** (blank outline for developers)
4. **QA Acceptance Criteria** in **Gherkin** (`Given` / `When` / `Then`)
5. **Definition of Ready** table (copied from house standard / golden ticket)

It also keeps a local **context memory** (epics, glossary, DoR, past briefs) so later tickets stay consistent with less typing.

> Investigation notes: [`docs/FEASIBILITY.md`](./docs/FEASIBILITY.md)

## Quick start

```bash
cd ba-jira-assistant
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without Jira credentials the app runs in **dry-run** mode and still drafts full ticket previews.

## Connect Jira (safe auth)

1. Create an Atlassian **API token** (not your password):  
   https://id.atlassian.com/manage-profile/security/api-tokens
2. Put values in `.env.local`:

```env
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=...
JIRA_DEFAULT_PROJECT=PROJ
JIRA_DEFAULT_ISSUE_TYPE=Story
JIRA_DRY_RUN=false
```

3. Restart `npm run dev`
4. Optional: harvest DoR from a golden ticket:

```bash
curl -X POST http://localhost:3000/api/tickets/harvest-dor \
  -H 'content-type: application/json' \
  -d '{"issueKey":"PROJ-123"}'
```

## Example brief

```text
Buyers need to save a lot from search results on web.
Epic: Discovery
Priority: High
Users can save and see it in My Lots.
```

## API surface

| Route | Purpose |
|---|---|
| `POST /api/chat` | Store brief context + draft ticket |
| `POST /api/tickets/preview` | Markdown preview |
| `POST /api/tickets/create` | Create issue (or dry-run) |
| `POST /api/tickets/harvest-dor` | Pull DoR table from a golden ticket |
| `GET/PATCH /api/context` | Read/update epic map, glossary, DoR |
| `GET /api/jira/status` | Connection / dry-run status |

## Important constraints

- Prefer API token / OAuth / service account — not SSO password sharing.
- Company-managed Jira may need Epic Link `customfield_#####` calibration after first live create attempt.
- Required create-screen fields vary by project; map them once from `createmeta`.
- For Cursor-native create/search, Atlassian Rovo MCP is an option; prefer org-approved / Runlayer-managed MCP configuration over ad-hoc shadow MCPs.
