# Jira BA Ticket Automation — Feasibility Investigation

## Verdict

**Yes — this is feasible**, and for a multi-client BA workflow (Christie's, McLaren, and others) it is a strong fit, with one important caveat: you should **not** hand an AI agent a normal username/password login. Use an **API token**, **OAuth**, or a **service account** **per company**. With that access, a chat-style app can turn minimal BA input (or an Excel dump) into consistently structured tickets and create them on the right boards with high fidelity.

Assuming “kirkin format” means **Gherkin** (`Given` / `When` / `Then`) for QA acceptance criteria.

**Multi-company isolation is required for authenticity.** Each company keeps its own login, boards, DoR, glossary, epic map, historical ticket references, and created-ticket log. See [`MULTI_COMPANY.md`](./MULTI_COMPANY.md).

---

## What “exactly replicable to Christie's standard” means in practice

Christie's tickets are unlikely to be a special Jira edition. They are almost certainly:

1. A **fixed description skeleton** (headings + tables) that BAs paste into every ticket
2. A small set of **project / issue-type / epic / component / label / custom field** conventions
3. A **Definition of Ready** checklist table that is copy-pasted across tickets
4. QA written in a predictable structure (here: Gherkin)

Jira's Cloud REST API v3 can reproduce all of that if we:

- Learn the house style from **1–3 exemplar tickets** (or a Confluence page / Word template)
- Convert that style into an **ADF (Atlassian Document Format)** template
- Fill variable slots from chat + stored context
- Create the issue via `POST /rest/api/3/issue`

Fidelity is then a template problem, not an API limitation.

---

## Access options (Path C recommended)

Corporate estates often block API tokens. The easiest day-to-day path is a **Chrome extension agent** that reuses the Jira tab you already signed into with Microsoft SSO. See [`CHROME_AGENT.md`](./CHROME_AGENT.md).

| Approach | Status here | Notes |
|---|---|---|
| **Chrome agent (session cookies on open Jira tab)** | **Recommended (Path C)** | No Cursor plugin. Side-panel tools: draft/create/search/move. Per-company account switcher. |
| **OAuth 2.0 (3LO) web app** | Available (Path B) | Next.js site; Atlassian consent then Microsoft SSO. See [`CORPORATE_SSO.md`](./CORPORATE_SSO.md). |
| **Manual draft + copy/paste** | Fallback | Always available from both paths. |
| **Atlassian Rovo MCP** | Optional later | Cursor-side; prefer org-approved / Runlayer-managed MCP. |
| **Email + API token** | Optional legacy | Often blocked. |
| **Sharing Microsoft password / automating the login form** | No | Do not do this. |

### Corporate realities at places like Christie's / McLaren

- Microsoft SSO / MFA (password is never stored in the app)
- API tokens often unavailable — OAuth is the create path
- OAuth app may need client IT allowlisting
- Tickets are created under the signed-in BA identity (good for audit)

**Bottom line:** Sign in with Microsoft once per company workspace; the app then creates/edits tickets as you.

---

## What the API can do for this workflow

### Easy / well supported

- Create Stories, Tasks, Bugs, Epics
- Set summary, description (rich ADF), labels, components, priority, assignee
- Link to epic / parent (team-managed: `parent`; company-managed: Epic Link custom field — discoverable via createmeta)
- Attach files after create (`POST .../issue/{key}/attachments`)
- Search existing tickets (`/search/jql`) to learn house style and pull DoR tables
- Read a golden ticket and clone its structural sections into new tickets
- Bulk create related tickets under one epic

### Needs a one-time calibration against their Jira

- Exact custom field IDs (`customfield_#####`)
- Required fields on the create screen
- Whether projects are team-managed or company-managed
- Issue-type names (“Story” vs “User Story” vs local names)
- Where DoR lives (description body vs custom field vs Confluence)

### Harder / out of scope for v1

- Perfect visual parity with every Jira UI quirk (ADF is close, not pixel-identical to every paste)
- Auto-filling true technical design (developers should own that section)
- Guaranteeing “Definition of Ready = Ready” without a human BA glance
- Creating Confluence pages + Jira tickets in one step unless Confluence API is also granted

---

## Mapping your BA requirements to a product design

### 1. Chat window + files + “minimal information”

**Feasible.** Pattern:

1. BA drops a short brief, screenshots/notes, links, acceptance thoughts
2. Assistant extracts: goal, users, scope, out-of-scope, dependencies, epic, environments
3. Asks only for missing Definition-of-Ready gaps
4. Produces a preview ticket in the house template
5. On confirm, creates in Jira (or dry-runs)

Minimal input can be as thin as:

> “Buyers need to save a lot from search results on web. Epic: Discovery. Priority: High. QA: can save and see in My Lots.”

…and still produce a full structured ticket if context memory already knows product vocabulary, DoR, and epic keys.

### 2. Long-lived context store

**Feasible and important.** Store:

- Product glossary (Christie's domain terms)
- Epic map (name → Jira key)
- Golden DoR table (ADF or markdown source of truth)
- Past ticket patterns that scored well with eng/QA
- BA preferences (tone, label sets, default project/components)
- Uploaded briefs / decisions over time

This is what makes tickets *consistent* rather than merely *generated*.

Local JSON is enough for a prototype. Production should use a real DB + optional embeddings for “find similar past tickets.”

### 3. Epic mapping + task-type distinctions

**Feasible.** Model BA work as typed intents, for example:

- `feature-story`
- `bug`
- `tech-enabler`
- `content-copy`
- `analytics-tracking`
- `integration`
- `spike`
- `qa-only` / test-charter companion

Each type shares the house skeleton but varies:

- Summary prefix
- Which sections are required
- Default labels/components
- Whether Gherkin is mandatory
- Whether a spike timebox replaces full AC

### 4. Ticket body structure (recommended house template)

```text
## Product Overview
<why / who / business outcome>

## Description
<clear BA instructions for developers — behaviour, rules, edge cases>

## Technical Information
<blank outline for developers to complete>
- Approach:
- Services / APIs:
- Data model:
- Feature flags / config:
- Rollout / monitoring:
- Open questions:

## QA Acceptance Criteria (Gherkin)
Scenario: ...
  Given ...
  When ...
  Then ...

## Definition of Ready
| Criterion | Status | Notes |
|---|---|---|
| ... | Yes/No | ... |
```

The DoR block can be a **literal paste** of the table from existing Christie's tickets once we harvest one golden example.

### 5. Gherkin for QA

**Feasible and ideal for automation.** Keep scenarios behavioural, not implementation-specific. Generate 2–5 scenarios covering happy path, validation, and one negative/edge case unless the BA marks it spike/docs-only.

---

## Cursor / agent integration paths

### Path A — Dedicated BA app (this repo)

Best when you want:

- Persistent BA context memory
- Preview-before-create UX
- Strict Christie's template enforcement
- File intake + multi-ticket epic breakdown

Auth: API token or OAuth into your app.

### Path B — Atlassian Rovo MCP inside Cursor

Best when you want:

- “Create this ticket” from an IDE chat with almost no custom UI
- Search Jira / Confluence while coding

Caveats:

- Org may need to approve the Atlassian MCP connector
- Template discipline still needs prompts or a thin wrapper
- Long-term private BA memory is not MCP’s job
- Per workspace MCP governance: prefer Runlayer-managed servers; ad-hoc `npx` MCP servers are shadow MCPs and should be avoided without approval

### Path C — Hybrid (recommended)

1. This app owns **intake, memory, template fidelity, preview**
2. Jira API (or approved MCP) owns **create/update/search**
3. Optionally expose the same create pipeline to Cursor later

---

## Effort / risk (technical, not calendar)

| Workstream | Invasiveness | Risk |
|---|---|---|
| API token create + dry-run create | Low | Low |
| Harvest golden ticket → ADF template | Low | Medium (wrong section parsing) |
| Required custom fields calibration | Low–medium | Medium (create fails until mapped) |
| Chat intake + clarifying questions | Medium | Low |
| Context memory + epic map | Medium | Low |
| OAuth multi-user + audit logging | Medium–high | Medium (app registration / admin) |
| Org SSO / MCP / service-account approval | Process | High (external dependency) |

The software side is straightforward. The main uncertainty is **Christie's Jira admin/policy surface**, not whether tickets can be created.

---

## Near-autonomous target state

The product objective is supervision-light creation:

1. You choose company + playbook
2. You give key parameters **or** upload files (Excel/CSV/notes)
3. The system uses **that company's** historical tickets + knowledge base to write authentic BA-standard tickets
4. You only intervene for low-confidence drafts or novel work types

Examples already modelled:

- **Christie's:** spreadsheet of engagements → `field-trip-by-engagement` → one ticket per row on the field board
- **McLaren:** configurator sections already in knowledge (or a sheet) → `configurator-design-sections` → one design ticket per section

## What we need from you to go from prototype → production fidelity

Per company:

1. **Jira site URL** (Cloud `*.atlassian.net` or DC base URL)
2. **Auth**: API token for a BA-capable account (or OAuth app + consent) — not a password
3. **1–3 golden tickets** that represent the house standard (keys are enough if readable)
4. **Target project/board key(s)** and default issue type
5. **Epic list** or naming convention
6. Confirmation whether DoR is always in the description (vs custom field)
7. Any required fields that block create (screenshots of the create form help)
8. Sample bulk files for recurring playbooks (field trips, design sections, etc.)

With those, the assistant can lock each company's template and create tickets that look like they came from a standard BA user for that organisation.

---

## Security notes

- Never collect or store Microsoft SSO passwords
- Prefer manual paste or browser OAuth consent over long-lived secrets
- If tokens exist, store them in env / secret manager, never in committed chat dumps
- Prefer a dedicated automation user only when IT provisions one
- Log every create/export with source brief ID for auditability
- Default to **preview → copy/paste or confirm → create**
- Redact PII from long-term memory if briefs include customer data
