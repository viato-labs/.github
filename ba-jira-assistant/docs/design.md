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
3. **Color over outlines** — separate regions with tonal fills (cool / warm / mint), not borders.
4. **Airy ease** — generous whitespace; one job per band; quiet metadata.
5. **Motion with meaning** — every animation signals state or hierarchy.
6. **Icons as verbs** — Material Symbols mark actions, not decoration spam.
7. **Responsive by default** — stack gracefully; horizontal account scroller on narrow viewports.

---

## 2. Foundations

### 2.1 Color

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0A0C12` | Canvas |
| `--bg-1` | `#10131C` | Sidebar / rail |
| `--bg-2` | `#181C28` | Input wells |
| `--surface` | soft white alpha | Default panel |
| `--surface-cool` | blue alpha | Active / guidance / context |
| `--surface-warm` | gold alpha | Add account / waiting |
| `--surface-mint` | mint alpha | Success toast / tips |
| `--ink` / `--ink-soft` / `--ink-faint` | `#F5F6F8` / `#A8B0BB` / `#6D7684` | Text |
| `--accent` / `--accent-deep` | `#5B8CFF` / `#3D6AE6` | Primary |
| `--accent-soft` | `rgba(91,140,255,0.18)` | Focus ring / selection |
| `--mint` | `#6DFFB0` | Success |
| `--gold` | `#E8C58A` | Portal kicker |
| `--danger` | `#FF6B7A` | Errors |

**No hairline borders for structure.** Panels, tickets, chips, and inputs are filled tonal shapes. Focus uses a soft accent glow, not a hard outline.

Whitespace scale: `--space-1` … `--space-6` (0.5 → 3.5rem). Main column uses flex gap; cards stack with air.

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

Use photography **only** in the portal hero/banner. Functional areas (setup, guidance, drafts, context) stay clear tonal panels with icons — no decorative images.

Hero switches to each company’s **UK headquarters**:

| Company | Place | Source |
|---|---|---|
| Christie's | King Street, St James’s, London | [Wikimedia](https://commons.wikimedia.org/wiki/File:Christie%27s_King_Street.jpg) (CC BY-SA 4.0) |
| McLaren | Technology Centre, Woking | [Wikimedia / Geograph](https://commons.wikimedia.org/wiki/File:McLaren_Technology_Centre,_Woking_-_geograph.org.uk_-_1836979.jpg) (CC BY-SA 2.0) |

Kicker label shows the place name when the account changes.

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
Sidebar (accounts) │ Compact hero banner
                   │ Session strip
                   │ 1 Setup (full width)
                   │ 2 Guidance (+ context when research returns)
                   │ 3 Draft tickets (full-width grid)
```

Main column uses the **full remaining width** (no narrow content cap).

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

**Do** keep one accent family; separate with color fields; leave air; match Chrome + web tokens.  
**Don’t** outline every box; neon every control; crowd the first viewport; use Inter/Roboto for brand.

### Responsive notes
- `≤1180px` — activity + mood stack under main
- `≤920px` — single column; account chips scroll horizontally
- `≤560px` — full-width CTAs, tighter type, still airy padding

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
