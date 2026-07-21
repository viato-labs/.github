# Corporate access reality: Microsoft SSO, no API tokens

## Straight answer

If Christie's / McLaren / other clients only give you a **normal Microsoft login** into Jira, you usually **cannot** hand that login to an automation agent the way people imagine (email + password → bot creates tickets).

Corporate Microsoft SSO almost always means:

- browser login
- MFA / Conditional Access
- no reusable password for scripts
- API tokens often disabled or blocked by policy

So full unattended “log in as me and create tickets” is **not** the default path.

That does **not** kill the tool. It changes the delivery mode.

---

## What still works (ranked for your situation)

### 1) Assistant drafts → you paste into Jira (most reliable now)

**Best default for corporate BA work with only Microsoft SSO.**

Flow:

1. Work in this app (company-isolated knowledge, Excel playbooks, house template)
2. Copy summary + description (or export a bulk pack)
3. Create the issue yourself while already logged into Jira via Microsoft
4. Optionally paste attachments manually

You keep authenticity and speed. Automation stops at the Jira create click.

This still achieves the main objective: minimal thinking to produce BA-standard tickets from short briefs/files.

### 2) Browser OAuth (“Sign in with Atlassian / Microsoft”) — possible, but IT-gated

You do **not** need a personal API token for this path.

How it works:

1. App opens Atlassian OAuth consent
2. Atlassian redirects to **Microsoft login** (your normal corporate SSO + MFA)
3. You approve scopes like `read:jira-work`, `write:jira-work`
4. App receives short-lived access tokens and can create tickets as **you**

Important constraints:

- Someone must register an Atlassian OAuth app (you, Viato, or client IT)
- Client IT may block third-party app consents
- Tokens expire; refresh must be stored securely
- Each company/tenant may need separate consent
- This is interactive login in a browser — never “give the AI your Microsoft password”

If IT allows one approved OAuth app, this is the clean path to near-autonomous create.

### 3) Official Atlassian Rovo MCP in Cursor

Same OAuth/SSO idea, Cursor-native. Useful if approved. Still may be blocked by enterprise app controls. Prefer org-approved / Runlayer-managed MCP configuration.

### 4) API token / service account

Ideal technically, often unavailable in locked-down corporates. Treat as optional upgrade, not the plan.

### 5) Automating the Microsoft login form / storing your password

**Do not do this.** Fragile with MFA, likely policy-violating, and insecure.

---

## Practical operating model for you

| Capability | With Microsoft SSO only | With OAuth approved | With API token/service account |
|---|---|---|---|
| Draft authentic tickets from knowledge | Yes | Yes | Yes |
| Bulk Excel → many drafts | Yes | Yes | Yes |
| Company-isolated memory | Yes | Yes | Yes |
| One-click create in Jira | No (copy/paste) | Yes | Yes |
| Unsupervised create at scale | Partial (you click create) | Yes, with confidence gates | Yes |

For day-to-day BA value, **mode 1 already wins**: the hard part is writing consistent tickets, not clicking Create in Jira.

---

## What to ask IT / the client (short email)

If you want one-click create later:

> We need an approved Atlassian OAuth app (or Atlassian Rovo MCP connector) so BAs can sign in with Microsoft SSO and allow ticket create on their behalf. We do not need shared passwords or personal API tokens if OAuth consent is permitted.

If IT says no:

> We'll keep the BA assistant in draft/export mode and create issues manually while signed in with Microsoft.

---

## Implication for this prototype

Default access mode is now **Manual (Microsoft SSO in browser + copy/paste)**.

API token fields remain as an optional advanced path. OAuth SSO connect is documented as the next enterprise upgrade when a client allows app consent.
