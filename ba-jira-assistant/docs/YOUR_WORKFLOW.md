# Your workflow — what works now vs next

## What you asked for

1. Log into one or many business Jira accounts  
2. Use Microsoft SSO for each  
3. Once signed in, create tickets as you  
4. Match each organisation’s ticket format from a knowledge base / historical tickets  
5. Learn from Confluence + past Jira where possible  
6. Accept docs, files, links, images, PDFs as context  
7. Auto-write tickets from your outline  
8. Example A: Christie's Excel (engagement filter) → each row = SCO ticket on BAU epic  
9. Example B: McLaren configurator design tickets from an outline (+ images)

---

## Status today

| Need | Status | Notes |
|---|---|---|
| Multi-company accounts | **Ready** | Christie's + McLaren seeded; add more anytime |
| Microsoft SSO login per company | **Ready (Path B)** | Sign in with Microsoft via Atlassian OAuth |
| Create tickets once logged in | **Ready** | Create / bulk create / update by key |
| Org-specific ticket format | **Ready to calibrate** | Template + per-company DoR/glossary/epics; you supply golden tickets to lock style |
| Knowledge base of historical tickets | **Ready** | Grows automatically from search + your creates; per company |
| Search Confluence + past Jira to learn | **Ready** | After Microsoft sign-in, each draft searches Jira + Confluence and stores hits |
| Excel → one ticket per row | **Ready** | Playbook `field-trip-by-engagement` |
| Engagement rows → SCO + BAU epic | **Ready (seeded)** | Titles prefixed `[SCO]`, epic mapped to `BAU` (replace key with real BAU epic) |
| McLaren configurator design tickets | **Ready** | Playbook `configurator-design-sections` from outline/knowledge |
| Upload Excel/CSV/text notes | **Ready** | Auto-runs bulk playbooks |
| PDF / images / rich media understanding | **Partial** | Files can be attached as context text; deep PDF/OCR/image vision is next |
| Links as context | **Partial** | Paste links into the brief; live page fetch/Confluence fetch is next |

---

## How your two examples run today

### Christie's — engagement Excel → SCO on BAU

1. Select **Christie's**  
2. **Sign in with Microsoft**  
3. Playbook: **Engagement → SCO tickets (BAU)**  
4. Upload filtered Excel/CSV  
5. Review bulk queue  
6. **Create all in Jira as me**

Replace seeded `BAU → EPIC-BAU` with the real BAU epic key in company memory when you have it.

### McLaren — configurator design pack

1. Select **McLaren**  
2. **Sign in with Microsoft**  
3. Playbook: **Configurator design sections**  
4. Either:
   - click **Draft design tickets from knowledge**, or  
   - paste an outline / upload a section sheet (+ image notes in the brief)  
5. **Create all in Jira as me**

---

## What I need from you to make it “authentic”

Per company:

- Real BAU / Configurator epic keys  
- 2–5 golden historical tickets (keys or exports)  
- Any DoR table paste you already use  
- One sample engagement Excel (Christie's)  
- One configurator outline (McLaren)  
- Optional: Confluence space links once we add search

---

## Example: new Christie's calendar feature

1. Sign into Christie's with Microsoft  
2. Brief: “Create a ticket for a new calendar feature on web…”  
3. Assistant searches Christie's Jira + Confluence for calendar/related feature context  
4. Draft includes continuity notes + related issue/page references  
5. Historical memory updates so later tickets get smarter  
6. Create in Jira as you  

It knows this is a **new** ticket, written in house style and connected to how existing features work.

## Next capability slice

1. Stronger PDF/image extraction into ticket evidence sections  
2. Deeper Confluence page body fetch (beyond search excerpts)  
3. Auto-harvest DoR tables from top matching golden tickets  
