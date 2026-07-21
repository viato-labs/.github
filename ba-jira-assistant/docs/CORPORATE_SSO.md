# Corporate access reality: Microsoft SSO, no API tokens

## Straight answer

If Christie's / McLaren / other clients only give you a **normal Microsoft login** into Jira, you usually **cannot** hand that login to an automation agent the way people imagine (email + password → bot creates tickets).

Corporate Microsoft SSO almost always means:

- browser login
- MFA / Conditional Access
- no reusable password for scripts
- API tokens often disabled or blocked by policy

So full unattended “log in as me and create tickets” is **not** available.

**Chosen product path for this tool: Path A only.**  
Draft here → copy/paste into Jira while you are signed in with Microsoft.  
OAuth / API-token create (Path B/C) is explicitly out of scope unless requirements change.

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

### 2) Browser OAuth / API token / MCP create — out of scope for this deployment

These can exist in other products, but **we are not building or relying on them here** because corporate Microsoft SSO access will not be connected for create/edit.

### 3) Automating the Microsoft login form / storing your password

**Do not do this.** Fragile with MFA, likely policy-violating, and insecure.

---

## Practical operating model (Path A only)

| Capability | Supported |
|---|---|
| Draft authentic tickets from knowledge | Yes |
| Bulk Excel → many drafts | Yes |
| Company-isolated memory | Yes |
| Login to Jira inside this app | No |
| Create/edit tickets via SSO connection | No — you do that in Jira |
| Copy summary/description / bulk paste pack | Yes |

Day-to-day value stays high: the hard part is writing consistent tickets; Create in Jira remains a short manual step while you are already signed in with Microsoft.

---

## Implication for this prototype

Access mode is **Manual only**: Microsoft SSO in the browser + copy/paste.  
No in-app company SSO login for create/edit.
