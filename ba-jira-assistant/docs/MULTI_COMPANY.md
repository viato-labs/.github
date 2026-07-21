# Multi-company workspaces

## Goal

Operate as a BA across several client Jira estates (Christie's, McLaren, and others) with:

1. **Separate logins** per company (API token / service account — never password)
2. **Hard isolation** of knowledge, DoR, glossary, epics, boards, and history
3. **Near-autonomous ticket writing** from short prompts or uploaded files
4. **Playbooks** for recurring bulk patterns

## Isolation model

```text
.data/workspaces/
  index.json                 # company list + active company
  christies/
    meta.json                # boards, playbooks, public connection flags
    memory.json              # glossary, epics, DoR, briefs, history
    secrets.json             # baseUrl/email/token/dryRun (gitignored via .data/)
  mclaren/
    meta.json
    memory.json
    secrets.json
```

Nothing in Christie's memory is used while drafting for McLaren, and vice versa.

## Seeded companies

### Christie's
- Jira: `https://christiestech.atlassian.net` (ref: [ENGS-19826](https://christiestech.atlassian.net/browse/ENGS-19826))
- Boards: `ENGS`, `FIELD`
- Playbook: `field-trip-by-engagement` — Excel/CSV row → field/engagement ticket
- Domain glossary + historical feature-story references

### McLaren
- Jira: `https://jira.task.mclaren.com` (ref: [DVC-1128](https://jira.task.mclaren.com/browse/DVC-1128))
- Boards: `DVC`, `CFG`
- Playbook: `configurator-design-sections` — design ticket per configurator section (from knowledge and/or spreadsheet)
- Prefer Chrome agent / logged-in session (self-hosted Jira, not Atlassian Cloud OAuth)

Add more companies from the UI (“Add company workspace”) or `POST /api/companies`.

## Simple operating modes

### 1) Single brief
1. Select company
2. Paste key parameters
3. Draft → Create

### 2) Christie's field trip spreadsheet
1. Select **Christie's**
2. Playbook **Field trip by engagement**
3. Upload Excel/CSV with engagement rows
4. Review bulk queue → Create all

### 3) McLaren configurator design pack
1. Select **McLaren**
2. Playbook **Configurator design sections**
3. Click **Draft design tickets from knowledge** (or upload a section sheet)
4. Review → Create all

## Autonomy / confidence

Each draft gets a confidence score from:

- brief richness
- epic resolution against company epic map
- glossary hits
- similar historical tickets in **that company only**
- remaining gaps

Use dry-run until confidence + house style look right. Then disable dry-run on that company's login only.

## Auth guidance (Path B)

Use **Sign in with Microsoft** (Atlassian OAuth) per company. Full detail: [`CORPORATE_SSO.md`](./CORPORATE_SSO.md).

| Do | Don't |
|---|---|
| Sign in separately for Christie's / McLaren / etc. | Share one OAuth session across clients |
| Keep one workspace + knowledge base per company | Paste Microsoft passwords into the app |
| Allowlist the Atlassian OAuth app with IT if consent is blocked | Automate the Microsoft login form / MFA |
| Fall back to copy/paste only when OAuth is blocked | Copy Christie's DoR into McLaren memory |

## APIs

- `GET/POST/PATCH /api/companies` — list/add/switch
- `POST /api/companies/credentials` — save per-company Jira login
- `POST /api/tickets/bulk` — spreadsheet/knowledge playbooks
- Existing chat/preview/create routes now accept `companyId`
