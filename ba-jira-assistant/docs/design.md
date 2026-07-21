# Ticket Flow Design System

Repeatable visual language for the **web app** and **Chrome agent**.  
A dark “magazine portal” into each company’s world — simple to use, rich to inhabit.

---

## Expert refinement loops (v1 → magical)

| Loop | Focus | Outcome |
|---|---|---|
| **1 · Foundation** | Tokens, Material Symbols, type, shell | Stable dark glass base + icon language |
| **2 · Interactions** | Hover morphs, active account slide, CTA spring, audience chips | Controls feel tactile and alive |
| **3 · Portal hero** | Full-bleed editorial imagery + brand-first headline | First viewport feels like entering their world |
| **4 · Motion** | Rise / ken-burns / toast / pulse / stagger / stage spin | Connected transitions without noise |
| **5 · Editorial polish** | Ticket spreads, mood tile, waiting visual, tip rail | Drafts read like magazine articles |
| **6 · System lock** | This doc + Chrome parity + reduced-motion | Repeatable across surfaces |

**Status:** all six loops shipped on web + Chrome side panel.

---

## 1. Principles

1. **Portal, not dashboard** — one composition; brand and company world first.
2. **Guidance in → tickets out** — no fake task menus.
3. **Depth over chrome** — glass, light edges, soft atmosphere.
4. **Motion with meaning** — every animation signals state or hierarchy.
5. **Human density** — generous space; metadata stays quiet.
6. **Icons as verbs** — Material Symbols mark actions, not decoration spam.

---

## 2. Foundations

### 2.1 Color

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#07080C` | Canvas |
| `--bg-1` | `#0C0E15` | Sidebar |
| `--bg-2` | `#141824` | Input wells |
| `--surface` | `rgba(255,255,255,0.045)` | Glass |
| `--surface-strong` | `rgba(255,255,255,0.08)` | Elevated glass |
| `--stroke` / `--stroke-strong` | `0.09` / `0.16` white | Edges |
| `--ink` / `--ink-soft` / `--ink-faint` | `#F5F6F8` / `#A8B0BB` / `#6D7684` | Text |
| `--accent` / `--accent-deep` | `#5B8CFF` / `#3D6AE6` | Primary |
| `--accent-soft` | `rgba(91,140,255,0.18)` | Selection / focus |
| `--mint` | `#6DFFB0` | Success |
| `--gold` | `#E8C58A` | Portal kicker |
| `--danger` | `#FF6B7A` | Errors |

Atmosphere: soft blue + warm gold radials + very light photographic wash (`mix-blend-mode: soft-light`).

### 2.2 Typography

| Role | Family |
|---|---|
| Brand / hero | Instrument Serif |
| UI | DM Sans |
| Icons | Material Symbols Outlined (Google Fonts) |
| Code | IBM Plex Mono |

Hero uses italic serif emphasis (`em`) for the human line.

### 2.3 Radius / space / elevation

- Radii: `12 · 16 · 24 · 32 · pill`
- Card padding: `24px`
- Sidebar: `272px`
- Elevation: soft shadow + thin edge light; accent glow only on primary / active account

### 2.4 Imagery

Editorial photos (atelier / craft / abstract light) as:

- Fixed body atmosphere (low opacity)
- Portal hero media (ken-burns)
- Mood tile + activity visual

Prefer real photography over abstract AI blobs. Swap per company later if desired.

### 2.5 Icons (Material Symbols)

| Context | Icon examples |
|---|---|
| Brand | `auto_awesome` |
| Accounts | `chevron_right`, `add_business` |
| Guidance | `edit_note`, `description`, `attach_file`, `upload_file` |
| Research | `travel_explore`, `psychology`, `insights` |
| Create | `publish`, `login`, `open_in_new` |
| Context list | `bug_report`, `menu_book` |

Load once in `layout.tsx` via Google Fonts CSS.

---

## 3. Layout

```
Sidebar (accounts) │ Portal hero (full-bleed editorial)
                   │ Session strip
                   │ Mood tile + Setup glass
                   │ Guidance glass │ Context rail
                   │ Draft ticket spreads
```

**Alignment**
- Shared `24px` card inset
- Primary CTAs right-aligned (`.actions.end`)
- Account row: avatar · copy · chevron
- Ticket: title + pill · meta · body

---

## 4. Components

### Portal hero
Brand-scale serif headline, gold kicker chip, capability chips, ken-burns media.

### Account switcher
Avatar initials, host subline, active glow, chevron morph on select.

### Glass card
Top edge light, blur, hover lift; title row with icon + optional pill.

### Drop zone
Dashed well for files; hover accent border.

### Buttons
Pill primary (gradient + glow), secondary surface, ghost text. Busy state spins `progress_activity`.

### Ticket spread
Staggered rise; hover lift; intent pill; readable preview body.

### Context / activity rail
Sticky; photo header; icon list with hover slide.

### Toast
Icon + message; mint / danger; spring entrance.

---

## 5. Motion system

| Name | Timing | Use |
|---|---|---|
| `rise` | 480–760ms `var(--ease-out)` | Panels, tickets |
| `slide-in-left` | 560ms | Sidebar |
| `ken-burns` | 28s alternate | Hero media |
| `atmosphere-drift` | 48s | Body wash |
| `toast-in` | 360ms spring | Feedback |
| `pulse-dot` | 2.4s | Signed-in |
| `spin` | 0.9s | Busy icon |
| Hover spring | `cubic-bezier(0.34, 1.4, 0.64, 1)` | Buttons, chips |

Respect `prefers-reduced-motion: reduce` (kill animation + ken-burns).

---

## 6. Content voice

- Headlines: short, human, brand-present
- Hints: one line, faint
- Chips: noun phrases (“Jira context”), not feature spam

---

## 7. Do / Don’t

**Do** keep one accent family; use icons as verbs; match Chrome + web tokens.  
**Don’t** neon every control; duplicate task nav; nest cards endlessly; use Inter/Roboto for brand.

---

## 8. Implementation map

| Surface | Files |
|---|---|
| Tokens + motion | `src/app/globals.css` |
| Icons load | `src/app/layout.tsx` |
| Composition | `src/app/page.tsx` |
| Chrome parity | `chrome-extension/sidepanel/panel.css` |
| This doc | Source of truth |

New UI: name the token here → implement in both CSS files → reuse Material Symbol names from the table.
