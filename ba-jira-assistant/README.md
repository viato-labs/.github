# BA Jira Assistant

Multi-company BA ticket studio with **Path B** access:

**Sign in with Microsoft (via Atlassian OAuth) → app creates/edits Jira as you.**

Each company workspace (Christie's, McLaren, …) keeps its own SSO session, boards, glossary, epics, DoR, and history.

> Feasibility: [`docs/FEASIBILITY.md`](./docs/FEASIBILITY.md)  
> Multi-company: [`docs/MULTI_COMPANY.md`](./docs/MULTI_COMPANY.md)  
> SSO / Path B setup: [`docs/CORPORATE_SSO.md`](./docs/CORPORATE_SSO.md)

## Quick start

```bash
cd ba-jira-assistant
cp .env.example .env.local
# fill ATLASSIAN_CLIENT_ID + ATLASSIAN_CLIENT_SECRET
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → choose company → **Sign in with Microsoft**.

## What you can do

- Draft from short briefs or Excel/CSV playbooks
- Create tickets in Jira **as the signed-in BA**
- Update existing issues by key
- Keep Christie's and McLaren knowledge fully isolated
- Fall back to copy/paste if a client blocks OAuth consent

## Playbooks

- `single-brief`
- `bulk-rows`
- `field-trip-by-engagement` (Christie's)
- `configurator-design-sections` (McLaren)

## Auth routes

| Route | Purpose |
|---|---|
| `GET /api/auth/atlassian/start?companyId=` | Begin Microsoft/Atlassian SSO |
| `GET /api/auth/atlassian/callback` | OAuth callback |
| `GET /api/auth/atlassian/status` | Connection status |
| `POST /api/auth/atlassian/logout` | Clear company session |

## Important

- Do **not** paste Microsoft passwords into the app
- OAuth app needs `offline_access` for refresh tokens
- Client IT may need to allow the Atlassian OAuth app
- Prefer org-approved / Runlayer-managed MCP if using Cursor connectors later
