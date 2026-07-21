# Path B: Sign in with Microsoft — app acts as you in Jira

## Chosen model

You click **Sign in with Microsoft** in this app.

1. Browser opens Atlassian consent
2. Atlassian redirects to your **company Microsoft login + MFA**
3. You approve access
4. The app receives tokens and can **create/edit Jira tickets as you**
5. Each company workspace keeps its own sign-in session

You do **not** paste your Microsoft password into the app or into chat.

---

## One-time setup (Atlassian OAuth app)

Someone (you or Viato) creates an OAuth 2.0 (3LO) app in the
[Atlassian Developer Console](https://developer.atlassian.com/console/myapps/):

1. Create app → **OAuth 2.0 (3LO)**
2. Callback URL:
   - Local: `http://localhost:3000/api/auth/atlassian/callback`
   - Deployed: `https://your-domain/api/auth/atlassian/callback`
3. Permissions / scopes:
   - `read:jira-work`
   - `write:jira-work`
   - `read:jira-user`
   - `offline_access` (refresh token — required)
4. Copy Client ID + Client Secret into `.env.local`:

```env
ATLASSIAN_CLIENT_ID=...
ATLASSIAN_CLIENT_SECRET=...
ATLASSIAN_REDIRECT_URI=http://localhost:3000/api/auth/atlassian/callback
APP_BASE_URL=http://localhost:3000
```

5. Restart `npm run dev`
6. In the UI: choose company → **Sign in with Microsoft**

If a client blocks third-party app consent, IT must allow this OAuth app (or you fall back to copy/paste for that client only).

---

## Day-to-day use

1. Select company (Christie's / McLaren / …)
2. **Sign in with Microsoft** (once per company until token refresh fails)
3. Draft from brief or Excel playbook
4. **Create in Jira as me** or **Update issue as me**
5. Sign out of that company when done if you want

---

## What this is / isn’t

| | |
|---|---|
| Is | Browser SSO login as you, then API create/edit as your user |
| Is | Per-company sessions + isolated knowledge |
| Isn’t | Storing your Microsoft password |
| Isn’t | Scraping the Jira login form |
| Isn’t | A shared bot identity (unless you later add a service account) |

---

## Fallback

Copy summary / description / bulk paste pack still exists if OAuth consent is blocked for a specific client.
