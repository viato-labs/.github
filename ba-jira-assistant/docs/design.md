# Ticket Flow Design System

Repeatable visual language for the web app and Chrome agent.  
Inspired by premium dark product dashboards (glass surfaces, calm hierarchy, tactile pills) — adapted for a BA ticket agent, not a music or finance clone.

---

## 1. Principles

1. **One job per view** — guidance in, tickets out. No control-panel clutter.
2. **Depth over chrome** — separate layers with surface tone + soft light, not heavy borders.
3. **Brand is visible** — “Ticket Flow” reads as the product, not a nav afterthought.
4. **Quiet motion** — short fades/rises; respect `prefers-reduced-motion`.
5. **Human density** — generous padding; metadata stays secondary.

---

## 2. Foundations

### 2.1 Color tokens

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#08090D` | App canvas |
| `--bg-1` | `#0E1017` | Ambient wash / sidebar |
| `--bg-2` | `#151822` | Recessed wells |
| `--surface` | `rgba(255,255,255,0.04)` | Glass card fill |
| `--surface-strong` | `rgba(255,255,255,0.07)` | Hover / elevated glass |
| `--stroke` | `rgba(255,255,255,0.08)` | Hairline edge |
| `--stroke-strong` | `rgba(255,255,255,0.14)` | Focus / active edge |
| `--ink` | `#F4F5F7` | Primary text |
| `--ink-soft` | `#A7AEB8` | Secondary text |
| `--ink-faint` | `#6F7884` | Labels, hints |
| `--accent` | `#5B8CFF` | Primary actions, active |
| `--accent-deep` | `#3D6AE6` | Pressed / gradient end |
| `--accent-soft` | `rgba(91,140,255,0.16)` | Selected chips, focus rings |
| `--mint` | `#6DFFB0` | Success / signed-in |
| `--warn` | `#FFD36A` | Caution |
| `--danger` | `#FF6B7A` | Errors |

**Atmosphere (background only):** soft radial washes — cool blue at top, muted violet at corner — low opacity so they never compete with content.

### 2.2 Typography

| Role | Family | Size / weight |
|---|---|---|
| Brand / display | Instrument Serif | 28–40px / 400 |
| UI / body | DM Sans | 14–16px / 400–650 |
| Labels | DM Sans | 11–12px / 650 / tracking `0.08em` / uppercase |
| Mono (previews) | IBM Plex Mono | 12–13px / 400 |

**Rules**
- Headlines: letter-spacing `-0.03em` to `-0.04em`
- Body: letter-spacing `-0.011em`
- Never use Inter / Roboto / Arial as the brand face

### 2.3 Radius scale

| Token | Value | Use |
|---|---|---|
| `--r-sm` | `12px` | Inputs, small chips |
| `--r-md` | `16px` | Inner panels |
| `--r-lg` | `24px` | Cards |
| `--r-xl` | `32px` | Hero shells |
| `--r-pill` | `999px` | Buttons, tabs |

### 2.4 Spacing scale

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`  
Default card padding: **24px**. Section gaps: **20–32px**. Sidebar width: **260px**.

### 2.5 Elevation

```css
--shadow-soft: 0 8px 32px rgba(0, 0, 0, 0.35);
--glow-accent: 0 0 0 1px var(--stroke-strong), 0 10px 40px rgba(91, 140, 255, 0.18);
```

Prefer **edge light** (`1px` stroke) + soft outer shadow over multi-layer neon glows.

### 2.6 Motion

| Name | Timing | Use |
|---|---|---|
| `rise` | 280–480ms `cubic-bezier(0.22, 1, 0.36, 1)` | Cards, toasts |
| Hover lift | 140ms | Buttons `translateY(-1px)` |
| Focus ring | 140ms | Inputs |

Disable animations when `prefers-reduced-motion: reduce`.

---

## 3. Layout

### Shell

```
┌──────── sidebar(260) ────────┬────────────── main ──────────────┐
│ Brand                        │ Top utility (session / CTA)      │
│ Accounts (avatars)           │ Hero                             │
│ + Add                        │ Glass: setup + guidance          │
│                              │ Glass: draft tickets + activity  │
└──────────────────────────────┴──────────────────────────────────┘
```

- **Sidebar:** company switcher only (accounts + add). No duplicate task menus.
- **Main:** single column up to `920px`, then optional activity column at `≥1100px`.
- Align labels, controls, and CTA row to a consistent left edge inside cards.

### Alignment rules

1. Card titles and primary fields share the same horizontal inset (`24px`).
2. Action rows: primary CTA right-aligned on desktop; full-width stacked on mobile.
3. Account rows: `avatar 36px` + `12px` gap + text block.
4. Ticket previews: title + status pill on one row; meta under; body preview below.

---

## 4. Components

### 4.1 Brand lockup
- Serif wordmark “Ticket Flow”
- Soft subtitle in `--ink-soft`
- Optional square mark (`28–32px`, radius `10px`, accent wash)

### 4.2 Account switcher
- Circular avatar with initials + company color
- Active: stronger surface + accent stroke
- Subline: Jira host URL (truncated)

### 4.3 Glass card (`.card`)
- Fill `--surface`, stroke `--stroke`, radius `--r-lg`
- Backdrop blur `16–20px` when supported
- Hover optional: `--surface-strong`

### 4.4 Fields
- Label: uppercase micro label
- Control: `--bg-2` fill, `--stroke` border, radius `--r-sm`
- Focus: accent border + `--accent-soft` ring (`4px`)

### 4.5 Buttons
| Variant | Style |
|---|---|
| Primary | Accent fill, pill, soft accent glow |
| Secondary | `--surface-strong`, stroke, pill |
| Ghost | Transparent, accent text |

### 4.6 Pills / status
- Soft fill (`--accent-soft` or mint wash)
- 11–12px bold label

### 4.7 Toast
- Glass strip; mint text for ok, danger for error
- Never block the hero permanently

### 4.8 Ticket preview
- Nested surface inside card
- Intent pill + project meta
- Scrollable preview body (`max-height ~14rem`)

### 4.9 Activity (research)
- Right or below drafts
- Compact list: Jira keys + Confluence titles
- Use mint/accent dots, not heavy icons

---

## 5. Content voice in UI

- Headlines: short, human (“Drop the guidance.”)
- Hints: one line, secondary color
- Avoid enterprise jargon in chrome (“workspace orchestration”, etc.)

---

## 6. Do / Don’t

**Do**
- Keep one accent family (`--accent`)
- Use glass + spacing for hierarchy
- Match Chrome agent + web app tokens

**Don’t**
- Purple neon soup on every control
- Dense Jira-clone toolbars
- Cards inside cards inside cards
- Default system fonts for brand

---

## 7. Implementation map

| Surface | Tokens / styles |
|---|---|
| Web app | `src/app/globals.css` (`:root` tokens + components) |
| Chrome agent | `chrome-extension/sidepanel/panel.css` (same token names) |
| This doc | Source of truth for new UI work |

When adding a component: name the token first here, then implement in both CSS files.

---

## 8. Accessibility

- Text contrast: primary on `--bg-0` ≥ WCAG AA
- Focus visible on all controls
- Hit targets ≥ `40px` height for pills
- Don’t rely on color alone for signed-in / error
