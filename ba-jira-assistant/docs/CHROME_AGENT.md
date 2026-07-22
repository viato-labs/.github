# Ticket Flow Chrome Agent

An AI BA agent in Chrome that uses **your already-logged-in Jira session**.

## What you do

1. Add each company with its **Jira URL** (Christie's, McLaren, …)
2. Open that Jira and log in as usual
3. Paste **guidance** — notes, docs, screenshots context, Figma / Confluence links
4. Choose who tickets are for: **Dev + QA**, Developers, QA, or Analysis first
5. **Research & draft** — searches related Jira + Confluence so wording matches what’s already there
6. **Create in Jira** — as you

No Cursor plugin. No API token. Confirm before create.

## Install

1. Chrome → `chrome://extensions`
2. Developer mode → **Load unpacked**
3. Select `ba-jira-assistant/chrome-extension`
4. Pin **Ticket Flow Agent**

## Why this shape

The job is not “pick a task type from a menu”.  
It’s: **use my login + this guidance + existing product context → write tickets like I would**.

Figma links and screenshots are treated as design/context references in the draft. Live Figma API parsing can come later; the link and your notes still drive clear Dev/QA tickets today.

## Design system

Visual tokens and components are documented in [`design.md`](./design.md).  
Web app and Chrome side panel share the same dark glass language.
