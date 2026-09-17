# Design Refresh — Implementation Strategy

> **Source designs:** `design-import/Modal design optimization with Trello/`
> — `Sprint Board.dc.html`, `To-dos List.dc.html`, `Task Card Modal.dc.html`
> **Scope:** sprint board, to-dos list page, task/to-do card modal, sidebar, top bar.
> **This is a visual refresh.** The designs are a skin over the existing app — see
> Decision 0 in §1. No new features, no schema changes, no API changes.
> **Status:** planned, not started. Update the tracker table in §10 as work lands.

All rules in `CLAUDE.md` apply in full — reuse audit before implementation, barrel
exports, `components/ui/Modal` for every dialog, `ConfirmDialog` for every destructive
confirm, `react-hook-form` for forms, `cn()` for conditional classes, **no hardcoded hex**.
This document adds constraints; it removes none.

---

## 1. The three decisions this plan is built on

**Decision 0 — The existing implementation takes precedence. The design is a skin.**

This is the governing rule and it outranks the other two. **The designs are a visual
reference, not a product specification.** Where a design implies a feature the app does
not have, a data field the schema does not carry, or a product decision that differs from
what is built — **the existing implementation wins and the design yields.**

In practice:

| The design implies | We do |
|---|---|
| A new feature | **Do not build it.** Restyle what exists. |
| A new schema field | **Do not add it.** Drop the element that needed it. |
| A different status set, label model, or colour map | **Existing wins.** `lib/todo-status.ts` and `lib/card-visuals.ts` are canonical. |
| A different API shape (server totals, pagination, aggregates) | **Existing wins.** No API changes. |
| A different information architecture | **Existing wins.** |

Three deliberate exceptions, because they are not "decisions" the design is competing on:

1. **Defects still get fixed.** A crash, a dead CSS class, an invisible modal backdrop or
   a broken `var()` name is a bug, not a design decision. §7 stands in full.
2. **Accessibility overrides both.** Where the design's own values fail WCAG (§2), the
   corrected values win — over the design *and* over what is currently shipped.
3. **Reuse consolidation stands.** §4 removes duplicate implementations of things that
   already exist. That reduces surface; it does not add features.

> **Why this matters for estimation:** an earlier draft treated the to-dos list as
> "mostly net-new feature work". Under Decision 0 it is not — it is a restyle. The
> feature ideas the design contains are captured in §11 as a *backlog*, explicitly not
> as scope.

**Decision 1 — Token strategy: retarget `--ap-*` values.**
The `--ap-*` architecture stays exactly as it is. Every token keeps its name and its
semantic role. Only the *values* change, to the new design's palette. ~330 existing
`var(--ap-*)` call sites across the sprint board, task card and todo modal inherit the
new look with zero edits.

We are **not** adding a fourth theme and **not** keeping the old palette. After this
work, "Apple Pro" is the name of the token layer, not a description of the colours.

**Decision 2 — Typography: adopt both faces.**
`--ap-font-sans` becomes **Instrument Sans**; `--ap-font-mono` becomes **IBM Plex Mono**.
This is app-wide — it affects the ~40 routes outside this redesign, which is accepted.
The mono face is load-bearing in the new design: eyebrows, counts, IDs, keyboard hints
and tabular numbers all use it.

---

## 2. Token mapping

Edit `app/globals.css`, the `.apple-pro-surface, .theme-apple-full` block (currently
lines ~950–1066) and the dark block (~1068–1124). **Change values only. Do not rename,
add or remove token names in this pass.**

### Surface

| Token | From | To |
|---|---|---|
| `--ap-bg` | `#F2F2F7` | `oklch(0.985 0.003 262)` |
| `--ap-bg-raised` | `#FFFFFF` | `#FFFFFF` |
| `--ap-bg-sunken` | `#EFEFF4` | `oklch(0.975 0.004 262)` |
| `--ap-bg-hover` | `#F7F7FA` | `oklch(0.96 0.004 262)` |

The design also leans on `oklch(0.955 0.004 262)` and `oklch(0.965 0.004 262)` for
inset chips and muted buttons. Both are close enough to `--ap-bg-sunken` to reuse it —
**do not introduce new surface tokens for them.**

### Border

| Token | From | To |
|---|---|---|
| `--ap-border` | `rgba(60,60,67,0.10)` | `oklch(0.92 0.006 262)` |
| `--ap-border-strong` | `rgba(60,60,67,0.22)` | `oklch(0.62 0.006 262)` ⚠ |
| `--ap-border-soft` | `rgba(60,60,67,0.06)` | `oklch(0.94 0.006 262)` |

⚠ `--ap-border-strong` is much darker than the design's `0.86`, and this matters.
WCAG 1.4.11 requires 3:1 for any border that **identifies a control** — input outlines,
checkbox and radio edges, focus rings. The design's border values sit at 1.13–1.27
against every surface. Decorative dividers are exempt, so the split is deliberate:

- **`--ap-border`** — decorative only. Card edges, table rules, dividers. Stays light.
- **`--ap-border-strong`** — every control boundary and focus indicator. Clears 3:1
  on all four surfaces (3.24–3.64).

Enforce this split in review. Using `--ap-border` on an input is now an accessibility
bug, not a style preference.

Note the new borders are **opaque**, not alpha. This is deliberate — the design's borders
read consistently over the tinted board backgrounds, which alpha borders do not.

### Text

| Token | From | To |
|---|---|---|
| `--ap-fg` | `#000000` | `oklch(0.26 0.015 262)` |
| `--ap-fg-muted` | `#3C3C43` | `oklch(0.32 0.015 262)` |
| `--ap-fg-secondary` | `rgba(60,60,67,0.72)` | `oklch(0.42 0.015 262)` |
| `--ap-fg-subtle` | `rgba(60,60,67,0.60)` | `oklch(0.53 0.012 262)` ⚠ |
| `--ap-fg-faint` | `rgba(60,60,67,0.36)` | `oklch(0.53 0.01 262)` ⚠ |

⚠ Both were darkened from the design's own values after the contrast audit (§2.1).
The design uses `0.55` for subtle, which fails 4.5:1 on `--ap-bg-hover` (4.32) — i.e.
secondary text inside a hovered row. Its `0.72` for faint fails **everywhere**, at
2.21–2.48, below even the 3:1 large-text floor.

### Accent

| Token | From | To |
|---|---|---|
| `--ap-accent` | `#007AFF` | `oklch(0.52 0.17 255)` |
| `--ap-accent-hover` | `#0060DF` | `oklch(0.45 0.17 255)` |
| `--ap-accent-soft` | `rgba(0,122,255,0.12)` | `oklch(0.95 0.03 255)` |
| `--ap-accent-fg` | `#FFFFFF` | `#FFFFFF` |
| `--ap-accent-on-soft` *(new)* | — | `oklch(0.42 0.15 255)` |
| `--ap-focus` *(new)* | — | `oklch(0.62 0.14 255)` |

Two new accent tokens, both filling real gaps:

- **`--ap-accent-on-soft`** — dark accent text on a soft accent fill. The designs use
  **eight near-identical values** for this (`0.42 0.15 255` ×4, `0.45 0.15 255` ×2,
  `0.44 0.15 255`, `0.46 0.14 255`, `0.48 0.16 255`, `0.42 0.13 255`, `0.45 0.1 255`,
  `0.4 0.1 255`) — all within 0.08 L of each other, and **none is `--ap-accent`**. Every
  sidebar-active label, linked-KR link, watch button and KR chip needs this and currently
  has nowhere to land. Collapse to one.
- **`--ap-focus`** — used 8× in the designs and **lighter than the accent**. See below.

> **Focus is a border swap, not a ring.** The designs contain no `outline` and no
> `box-shadow` ring anywhere. Focus is always `border-color: oklch(0.62 0.14 255)` at
> 1.5px (inputs, selected date row) or 2px (description textarea, comment composer),
> plus a background lift to `#fff`.
>
> This **conflicts with the existing `.ap-focus-ring`** (a 3px `rgba(0,122,255,0.35)`
> glow) that `DESIGN_SYSTEM.md` §12 mandates for all new interactive elements. Pick one
> and write it into §12 — do not ship a third focus style. If you keep `.ap-focus-ring`,
> retarget its colour to `--ap-focus` so at least the hue agrees.

### Status

| Token | From | To |
|---|---|---|
| `--ap-ok` | `#34C759` | `oklch(0.62 0.15 150)` |
| `--ap-ok-bg` | `rgba(52,199,89,0.15)` | `oklch(0.955 0.03 150)` |
| `--ap-ok-fg` | `#1F7A33` | `oklch(0.42 0.10 150)` |
| `--ap-warn` | `#FF9500` | `oklch(0.72 0.14 70)` |
| `--ap-warn-bg` | `rgba(255,149,0,0.15)` | `oklch(0.975 0.02 70)` |
| `--ap-warn-fg` | `#A85800` | `oklch(0.44 0.11 60)` |
| `--ap-danger` | `#FF3B30` | `oklch(0.58 0.19 25)` |
| `--ap-danger-bg` | `rgba(255,59,48,0.14)` | `oklch(0.96 0.025 25)` |
| `--ap-danger-fg` | `#B3271E` | `oklch(0.49 0.18 25)` |
| `--ap-ahead` | `#AF52DE` | `oklch(0.65 0.14 300)` |
| `--ap-ahead-bg` | `rgba(175,82,222,0.14)` | `oklch(0.95 0.03 300)` |
| `--ap-ahead-fg` | `#7A2DB0` | `oklch(0.42 0.13 300)` |
| `--ap-none` | `#8E8E93` | `oklch(0.72 0.01 262)` |
| `--ap-none-bg` | `rgba(142,142,147,0.15)` | `oklch(0.965 0.004 262)` |
| `--ap-none-fg` | `#3C3C43` | `oklch(0.42 0.015 262)` |

`--ap-red` / `--ap-green` / `--ap-orange` are aliases — keep them mirroring
danger / ok / warn.

`--ap-kr-bar-bg`: `rgba(60,60,67,0.12)` → `oklch(0.93 0.006 262)`.

### Radius

The new design is measurably tighter than Apple Pro. This is the single biggest
structural shift in the token layer.

Measured frequency across all three designs (207 radii total):

| px | count | | px | count |
|---|---|---|---|---|
| **7** | **48** | | 5 | 11 |
| **6** | **41** | | 4 | 10 |
| 50% | 28 | | 10 | 9 |
| 8 | 21 | | 11 | 6 |
| 9 | 16 | | 12 | 4 |
| 99 | 11 | | 14 | 1 |

**7px and 6px are 89 of 207 — the two workhorses.** 7px is the nav row, small button,
popover row and input; 6px is the chip, icon button and menu item. 14px occurs **once**
(the modal shell).

| Token | From | To | Role |
|---|---|---|---|
| `--ap-radius-xs` *(new)* | — | `6px` | Chips, icon buttons, menu items |
| `--ap-radius-sm` | `10px` | `7px` | Nav rows, small buttons, inputs, popover rows |
| `--ap-radius-md` | `14px` | `9px` | Larger buttons, menu-type popovers |
| `--ap-radius-card` | `16px` | `12px` | Cards, board lanes, tables, docks |
| `--ap-radius-lg` | `22px` | `14px` | Modal shell only |
| `--ap-radius-pill` | `999px` | `999px` | |

> An earlier draft of this document set `sm: 8px / md: 11px`, which **inverted the scale** —
> it promoted one-offs to tokens and dropped both workhorses. The values above are
> measured, not estimated. A fifth token (`xs`) is added because 6px and 7px carry
> distinct roles and collapsing them loses the chip/row distinction the design relies on.
>
> `11px` (panel popovers) and `10px` (nested popovers, cards) are real but narrow — let
> the `Popover` `variant` prop carry them rather than adding two more tokens.

`.ap-modal` currently hardcodes `20px` — change it to `var(--ap-radius-lg)` so it stops
disagreeing with its own token.

> **Retargeting the radius tokens will accomplish almost nothing on its own.**
> `--ap-radius-*` has only **25 call sites in 8 files**. Meanwhile **~250 hardcoded
> radii matching the old token values** (`rounded-[10px]`, `[14px]`, `[16px]`, `[20px]`,
> `[22px]`) are spread across 60+ files. After Phase 1 those stay at the old sizes while
> the tokens drop to 8/11/12/14 — so the app gets *less* consistent, not more.
>
> The most visible mismatch will be in the shared primitives: `Skeleton` hardcodes
> `rounded-[14px]` and `rounded-[16px]`, and all three `components/ui/dashboard/*` cards
> hardcode `rounded-[14px]`. **A skeleton at 14px will sit directly beneath the 12px card
> it stands in for.**
>
> Treat the hardcoded-radius sweep as part of Phase 1, not Phase 7. A find-and-replace
> of the five old values onto the four tokens is mechanical and should land with the
> retarget. `tailwind.config.js` also defines a separate radius scale
> (`card: 0.75rem`, `card-lg: 1rem`) that does not follow `--ap-radius-*` — align it too.

### Shadow

| Token | To |
|---|---|
| `--ap-shadow-sm` | `0 1px 2px oklch(0.2 0.04 260 / 0.06)` |
| `--ap-shadow-card` | `0 1px 2px oklch(0.2 0.04 260 / 0.07)` |
| `--ap-shadow-md` | `0 4px 12px -4px oklch(0.2 0.04 260 / 0.18)` |
| `--ap-shadow-lg` | `0 24px 64px -12px oklch(0.2 0.04 260 / 0.45), 0 2px 8px oklch(0.2 0.04 260 / 0.12)` |

Popover elevation is **not one value — it is a ramp keyed to popover width.** Wider
popover, deeper shadow. Six distinct shadows appear across the designs:

| Token | Value | Used by |
|---|---|---|
| `--ap-shadow-pop-sm` | `0 12px 28px -8px oklch(0.2 0.04 260 / 0.28)` | Status menu (176) |
| `--ap-shadow-pop-md` | `0 14px 32px -10px oklch(0.2 0.04 260 / 0.3)` | Priority (168), more-menu (186) |
| `--ap-shadow-pop-lg` | `0 16px 36px -10px oklch(0.2 0.04 260 / 0.3)` | Filter select (190), item date (232), item assign (244) |
| `--ap-shadow-pop-xl` | `0 18px 40px -12px oklch(0.2 0.04 260 / 0.32)` | Board background (268), checklist (252) |
| `--ap-shadow-pop-panel` | `0 18px 40px -12px oklch(0.2 0.04 260 / 0.32), 0 2px 6px oklch(0.2 0.04 260 / 0.08)` | Members (272), Labels (276), Dates (290), OKR (420) |
| `--ap-shadow-dock` | `0 10px 30px -8px oklch(0.2 0.04 260 / 0.28)` | Board view dock |

The dark bulk-action dock uses `0 14px 34px -10px oklch(0.2 0.04 260 / 0.5)` — deeper,
because it sits on a dark fill. Tie the ramp to the `Popover` `width` prop so call sites
never pick a shadow by hand.

Overlay scrim (both modals): `oklch(0.28 0.03 262 / 0.46)` + `backdrop-filter: blur(3px)`.

### Font

```
--ap-font-sans: "Instrument Sans", system-ui, -apple-system, sans-serif;
--ap-font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

Load both via `next/font/google` in `app/layout.tsx`, replacing the current Inter import.
Keep `next/font` — do **not** add the Google Fonts `<link>` tags the design uses; they
cost a render-blocking round trip that `next/font` avoids.

**Changing the token values alone changes nothing.** `app/layout.tsx:39` puts
`inter.className` directly on `<body>`, and that beats
`.apple-pro-surface { font-family: var(--ap-font-sans) }` — same specificity, later in
the built CSS (verified by byte order). `--ap-font-sans` has never been the rendered
font. `theme-body-class.tsx:16` then re-asserts the Inter class on every theme change.

Five coordinated edits are required:

1. Replace the `Inter()` call in `app/layout.tsx:11-17`.
2. Update `<body>`'s className at `:39`.
3. Update the `baseClassName` prop passed to `ThemeBodyClass` at `:41`.
4. Update `--ap-font-sans` / `--ap-font-mono` at `globals.css:952-953`.
5. **Add a `fontFamily` key to `tailwind.config.js` — it has none.**

> **Step 5 is the one that is easy to miss and would quietly gut half the refresh.**
> With no `fontFamily` in the config, every `font-mono` utility in the app resolves to
> Tailwind's default `ui-monospace` stack, **not IBM Plex Mono**. Only two selectors in
> `globals.css` actually read `--ap-font-mono`. There are ~14 files using `font-mono`
> today — key-result detail, sprint report, letters, progress, comments, activity,
> notifications, AI logs, automations, trip plan. Without step 5 the mono face lands on
> two selectors and the new `Eyebrow`/`CountChip` primitives, and nothing else.
>
> Add: `fontFamily: { sans: ['var(--ap-font-sans)'], mono: ['var(--ap-font-mono)'] }`.

**Amharic coverage — verify before shipping.** `globals.css:1538` provides a Noto Sans
Ethiopic fallback via `.font-amharic` / `.letter-amharic`. Instrument Sans has **no
Ethiopic coverage**, so Amharic text *outside* those two classes may lose its fallback
once `--ap-font-sans` actually applies to `<body>`. Append the Ethiopic face to the
`--ap-font-sans` stack rather than relying on the scoped classes.

Also hardcoded and will keep Inter regardless: `AppleAnalytics.tsx:158`
(`fontFamily="ui-monospace"` on an SVG), `lib/letter-html.tsx:134-141` (an `@font-face`
aliasing **'Inter' → NotoSans**), the six `lib/projects/*-report.ts` generators, the Gantt
export route, and every email template. These render outside the app shell — decide per
surface whether they should follow.

### 2.5 Blast radius — read this before estimating

The retarget is **not** scoped to the four redesigned surfaces. `--ap-*` is read at
**~2,300 call sites across 130 files**; roughly **1,750 of them, in ~124 files, sit
outside this redesign** and will change appearance the moment Phase 1 lands.

Heaviest consumers, none of which are in the design:

| Route / area | refs | Note |
|---|---|---|
| `/dashboard/filters` | 275 | **Effectively a fifth redesigned surface.** `ObjectiveDetailModal` (44) and `KeyResultDetailModal` (56) are full modals built entirely on `--ap-*`, and are the only non-sprint consumers of `--ap-radius-*` at scale. |
| `/dashboard/objectives/[id]` | 116 | `ObjectiveHero` alone is 49. |
| `features/sprints` (non-board) | 150 | Report, list, planner, switcher, background picker. |
| `/dashboard/admin/org` | 98 | |
| `/dashboard/key-results/[id]` | 84 | |
| `components/dashboard` | 77 | Incl. SVG `fill="var(--ap-fg-faint)"`. |
| `/dashboard/okrs-all` | 68 | |
| `/dashboard/reports` | 66 | Also a print surface. |
| `components/ui` primitives | 56 | **App-wide** — date picker, popover, skeleton, empty state. |
| `components/shared` | 48 | `StatusPill` (26) renders on nearly every OKR route. |
| `app/auth/*` | 42 | **Unauthenticated — the product's first impression.** |
| `components/cmdk` | 34 | Root-layout mounted, app-wide. |

Routes that will **not** move — `/dashboard/settings/*`, `/dashboard/projects/*`,
`/dashboard/automations/*`, `/dashboard/travel`, `/dashboard/org/*`, `app/portal/*` —
sit on shadcn `hsl(var(--border))` tokens and **will visibly diverge** from everything
that does. Decide whether that split is acceptable before Phase 1, not after.

> **Consequence for sequencing:** Phase 1 is still the right first step, but it is not a
> quiet one. Budget a full-app visual review after it, not a review of four screens.

### 2.6 Satellite copies of the palette that will silently go stale

The token values are duplicated in four places that nothing keeps in sync. Each must be
updated by hand in Phase 1 or it becomes a lie:

1. **`lib/design/apple-pro-tokens.ts`** — a complete JS mirror of every colour, radius,
   font and shadow. **Zero importers.** Either update it or delete it; do not leave it.
2. **`lib/email/templates/components.ts:14-30`** — a `TOKENS` object hand-copied from the
   *current* palette (`#F2F2F7`, `#007AFF`, `#34C759`, `#FF9500`, `#FF3B30`). Consumed by
   every email template plus the daily/weekly digests and automation renders. **Email will
   keep iOS blue and 14px radii forever** unless edited. Nothing fails if you forget.
3. **`lib/card-visuals.ts:44-53`** — the card palette carries both a `token: '--ap-card-*'`
   field and a literal `hex`, with no binding between them. We are leaving this palette
   alone (see below), but be aware the two copies exist.
4. **`lib/card-visuals.test.ts`** — the repo's **only** colour assertion. Pins exact hexes
   (`#61BD4F`, `#EB5A46`, `#F2D600`, `#344563`). Safe while the card palette is untouched;
   it is the tripwire if anyone changes it.

There are no component tests, snapshots, or visual-regression suites anywhere in the repo,
so **nothing else will catch a token mistake.** Review is the only gate.

### 2.7 `.ap-glass` will not follow the retarget

`globals.css:1151` hardcodes `border-color: rgba(60,60,67,0.12)` rather than reading
`--ap-border`. The header and sidebar therefore keep the old grey border while everything
around them moves to the new opaque one — **a visible seam on every page.** Change
`.ap-glass` to read the token as part of Phase 1.

### 2.8 Opaque borders change how hairlines print and render

The new `--ap-border` is opaque; the old one was `rgba(…, 0.10)`. Two consequences:

- **0.5px hairlines get stronger, not just different.** An alpha-0.10 border at 0.5px is
  a whisper; an opaque light grey at 0.5px is a crisp line that subpixel-rounds
  inconsistently on non-retina. 14 hairlines outside the four surfaces are affected,
  including `.ap-card` and `.ap-input` — the two most-used surfaces in the app.
- **Printed reports will gain rules they did not have.** The `@media print` block forces
  white background and black text on `html, body` only; descendant borders still resolve
  through the token. Most printers drop alpha-0.10 borders entirely and will print the
  opaque ones. Affects the reports dashboard, initiative report, progress print and the
  daily-trip-plan run/movement sheets.

Also: `EndSprintModal:359,373` toggles between `--ap-accent` and `--ap-border` to show
selection. With an opaque border the unselected state gains weight and the
selected/unselected contrast collapses. Check it after Phase 1.

### 2.9 Board backgrounds — merge both sets, keep every key

**Decided (2026-09-17).** `lib/sprint-backgrounds.ts` has 11 presets; the design has 11.
Six names overlap, all values differ. Merge them.

**The stored value is the key** (`sprint.background = 'graphite'`), never the colour — so
retargeting values is safe and needs no migration. **Every existing key must survive**, or
sprints saved against it lose their ground.

| key (keep — in the DB) | label | new value from |
|---|---|---|
| `none` | None | design **Paper** |
| `sunrise` | Sunrise | *derive* — no design equivalent (see below) |
| `slate` | Slate Mist | design **Slate** |
| `sage` | Sage | design **Sage** |
| `peach` | Peach | design **Peach** |
| `lavender` | Lavender | design **Periwinkle** |
| `graphite` | Graphite | design **Graphite** |
| `ocean` | Ocean | design **Sky** |
| `dusk` | Dusk | design **Lilac** |
| `mint` | Mint | design **Mint** |
| `blush` | Blush | design **Blush** |
| `clay` *(new)* | Clay | design **Clay** |

That is 10 mapped directly, 1 derived, 1 added — 12 presets, zero data risk.

**`sunrise` has no design counterpart** and must not collide with `peach`. Derive it in
the design's idiom (a two-stop `linear-gradient(150deg, …)`), pushed golden rather than
pink so the two stay distinguishable:

```
swatch: linear-gradient(150deg, oklch(0.95 0.045 75), oklch(0.93 0.055 45))
board:  linear-gradient(150deg, oklch(0.96 0.035 75), oklch(0.94 0.045 45))
```

Two structural notes:

- The shapes already match — existing presets carry `swatch` + `gradient`, the design
  carries `swatch` + `board`. Map `board → gradient`. The design's swatch is deliberately
  a **stronger** gradient than the ground it applies; preserve that, it is what makes the
  picker chips readable at 40px.
- **`isDarkBackground()` needs no change.** It returns true only for `graphite`, and
  Graphite is the only dark preset in the design too. The dark-fork work in §6.3 keys off
  the same single preset.

> Doing nothing here is not neutral: Phase 1 retargets the lanes, cards and borders that
> sit **on top of** these grounds. Old gradients under new opaque borders will clash.

### 2.10 Type and space scale

The designs have a real scale; the app currently has ~450 arbitrary values and no scale
in use. Measured frequency:

**Font size** — 13px (60×) · 12.5 (29) · 10 (27) · 13.5 (14) · 9.5 (13) · 11 (12) ·
11.5 (10) · 12 (9) · 10.5 (5) · 14 (4). Display sizes are all one-offs: 26 (to-dos H1),
23 (modal H1), 22 (sprint H1), 18 (topbar title).

**Font weight** — 600 (66×) · 500 (55×) · 700 (24×). **400 is never used explicitly.**

**Height** — 32px (27×, nav rows/inputs/primary buttons) · 26 (21, avatars, chips,
segmented pills) · 30 (20, icon buttons, calendar cells) · 34 (18, search, header
buttons) · 24 (12, small icon buttons) · 28 (9) · 22 (6) · 20 (6) · 17 (5, checkbox).

**Gap** — 9px (27×) · 8 (24) · 10 (18) · 6 (12) · 1 (11, tight stacks) · 2 (10,
segmented/calendar) · 7 (9) · 4 (7).

**Padding** — `0 10px` (32×) · `0 11px` (9) · `7px 8px` (8, popover menu item) ·
`0 14px` (7) · `0 12px` (7) · `5px` (5, **menu**-type popover) · `10px` (5, **panel**-type
popover). Popover padding forks by type: menus `5px`, panels `9–12px`.

**Motion** — only two transitions exist in the entire design set: `transform 0.15s ease`
(group chevron) and `width 0.25s ease` (progress fill). Everything else is static.
Do not invent animation the design does not have.

Register these in `tailwind.config.js` so the arbitrary values have somewhere to go.
Without a scale, the retarget makes the app *look* new while leaving it just as
inconsistent underneath.

### 2.11 Priority is a four-value enum with two untokenised hues

Identical in both the board and list designs:

| Priority | Value | Token |
|---|---|---|
| Low | `oklch(0.62 0.12 215)` | **none — cyan, no equivalent** |
| Medium | `oklch(0.72 0.14 70)` | `--ap-warn` ✓ |
| High | `oklch(0.65 0.17 40)` | **none — sits between warn (70) and danger (25)** |
| Urgent | `oklch(0.58 0.19 25)` | `--ap-danger` ✓ |

Add `--ap-priority-low` and `--ap-priority-high`, or map Low→`--ap-none` and
High→`--ap-danger` and accept a flatter scale. Decide before the priority column ships.

### Card palette

`--ap-card-*` (the 10 label/cover swatches) and `lib/card-visuals.ts` `CARD_PALETTE`
stay as they are. The design's label colours are a different, smaller set, but the
existing palette is persisted in the database (`TodoLabelDef.color`) — changing it would
orphan every saved label. **Out of scope.**

---

## 3. Dark mode — foundation work, do this first

Dark mode is currently written but unreachable, and the retarget makes that worse: the
new opaque borders and oklch surfaces have no dark counterparts at all.

Three things are broken and all three must be fixed in the same change:

1. `tailwind.config.js` has no `darkMode` key, so Tailwind defaults to `'media'` while
   the CSS in `globals.css` keys off a literal `.dark` class. → Set `darkMode: 'class'`.
2. Nothing in the codebase ever sets `.dark`. → Add it to `<html>`, not `<body>`.
3. `bodyClassForTheme()` overwrites `body.className` wholesale, so a `dark` class on
   `<body>` would be wiped on every theme change. → This is exactly why it goes on `<html>`.

Then fill the dark gaps. These tokens have **no dark value today** and will be wrong the
moment dark mode is reachable: every `-bg`/`-fg` status triplet, `--ap-accent-fg`, all
`--ap-radius-*`, all `--ap-shadow-*`, all `--ap-card-*`.

Dark surface values to add, derived from the design's `Graphite` board background:

```
--ap-bg:         oklch(0.19 0.012 262)
--ap-bg-raised:  oklch(0.24 0.014 262)
--ap-bg-sunken:  oklch(0.16 0.012 262)
--ap-bg-hover:   oklch(0.28 0.015 262)
--ap-border:     oklch(0.32 0.014 262)
--ap-fg:         oklch(0.96 0.003 262)
--ap-fg-subtle:  oklch(0.68 0.010 262)
--ap-accent:     oklch(0.62 0.17 255)
```

> **Confirmed in scope (2026-09-17).** Dark mode ships with this refresh. All three
> wiring fixes and the full set of dark token values are required in Phase 1 — a
> half-wired dark mode is worse than none, so this is all-or-nothing and it is on.

### 3.1 The "Default" theme is already broken — decide its fate now

`bodyClassForTheme('default', …)` drops both `apple-pro-surface` and `theme-apple-full`,
and the entire `--ap-*` block is scoped to those two classes with nothing on `:root`.
So in that theme every bare `var(--ap-…)` resolves to nothing.

**2,239 of 2,301 call sites (97%) have no fallback value.** Only six files are written
defensively — the `features/goals` group, `EmptyState` (which uses the correct pattern,
`var(--ap-bg-sunken, hsl(var(--muted)))`), `ThemeSwitcher`, `ModeToggle` and `PlansGantt`.

What a user selecting "Default" sees today: every `StatusPill` loses its text and dot
colour, skeletons render as transparent boxes, the command palette has no background over
its scrim, the date picker has no surface, and every `.ap-btn-primary` becomes a
transparent borderless button. This is pre-existing, not caused by the refresh.

**Decided (2026-09-17): do both — move the tokens to `:root`, and drop the "Default" tab.**

**1. Move the `--ap-*` block from `.apple-pro-surface, .theme-apple-full` to `:root`.**
Theme classes then only *override* rather than *define*. One edit; it makes all 2,239
unguarded call sites resolve in every context, forever. This is worth doing on its own
merits — it removes a whole class of "component renders colourless" bug that has nothing
to do with theming, including inside print, email previews and any future surface that
renders outside the app shell.

**2. Remove `'default'` from `ThemeName` and from `ThemeSwitcher`.** Reasons, in order:

- It is broken today and nobody has reported it, which is weak evidence anyone uses it.
- After step 1 it would no longer be *broken* — it would be near-identical to "Apple",
  since the tokens now resolve from `:root` and `.apple-pro-surface` adds little beyond
  them. Three tabs where two look the same is worse UI than two tabs.
- Decision 1 says one visual language ships. A "Default" tab showing the base shadcn
  blue-grey would be a third language contradicting that.

Ship **Apple** and **Apple Pro**. `bodyClassForTheme` loses its first branch; the
persisted `okr-theme` value `'default'` must fall back to `'apple-pro'` rather than
throwing — existing users have it in localStorage.

> This is not a Decision 0 violation. Decision 0 protects existing *working* behaviour
> from being overwritten by the design. Removing a control that renders the app
> colourless is a defect fix, and the design does not ask for it either way.

---

## 4. New shared primitives

> **Justify primitives by call sites in the *codebase*, not occurrences in the designs.**
> An earlier draft counted design occurrences and proposed seven. Measured against the
> repo, **four are justified, two are not, and one duplicates something that already
> exists.** Build four.

| Component | Real call sites | Verdict |
|---|---|---|
| `Eyebrow` | **249 across 94 files** | **Build** — see the mono warning below |
| `FilterSelect` | ~25 native `<select>` filters + 2 hand-rolled popovers | **Build** — as a wrapper over `ui/select.tsx` |
| `EntityPicker` | **11 independent implementations** | **Build** — by promoting an existing one |
| `SectionHeading` | 7 hand-rolled, two byte-identical | **Build** — by extraction |
| `CountChip` | ~8 | **Don't** — two equivalents already exist |
| `FloatingDock` | **1** | **Don't** — leave it inline |
| `DueDateChip` | 10–12 | **Build**, but resolve a semantic conflict first |

### `Eyebrow` — build it, but **not in mono**

249 existing eyebrows across 94 files, spread over three sizes, five tracking values,
four weights and four colour tokens. That spread is the actual bug, and the primitive
fixes it.

> ⚠ **Not one of the 249 is mono.** Shipping the design's mono eyebrow as the default
> means 249 visual regressions across the app. Default to non-mono, matching the
> 54-occurrence majority (`text-[11px] font-semibold uppercase tracking-wide
> text-muted-foreground`), and add `mono` as an opt-in for the four redesigned surfaces.

Props needed, from the designs: `size` (`10px/.1em` ×16, `9.5px/.12em` ×4 sidebar,
`9.5px/.11em` ×1 table header), `align` (popover panel eyebrows are **centred**; sidebar
and board eyebrows are left-aligned), and `mono`.

Nearest existing: `components/ui/dashboard/DashboardCard.tsx:19` bakes an 11px eyebrow
into its header and its own comment calls it "a small uppercase eyebrow".

### `FilterSelect` — wrap `ui/select.tsx`, do not hand-roll a popover

> ⚠ **Replacing a native `<select>` with a div-based popover is an accessibility
> downgrade** unless it implements listbox roles, type-ahead and arrow-key roving.
> `components/ui/select.tsx` is Radix-based and already accessible — and is used in only
> **5 files**. Build `FilterSelect` as a thin styled wrapper over it.

Start from `features/filters/components/FilterBar.tsx:305-372`, which is already a
near-complete generic implementation (trigger, outside-click, scrollable panel,
conditional search above 6 options, active highlighting). The app has 195 native
`<select>` elements across ~90 files; at least 25 are filters rather than form fields.

### `EntityPicker` — promote, don't write a twelfth

There are **11** independent OKR search-and-pick implementations, not three:
`LinkToOkrPopover`, `TodoCardModal`, **two copies inside `CreateTodoModal` alone**,
`ParentObjectiveSelector`, `AddAlignedObjectiveModal`, `CheckInPickerModal`,
`SprintCardModal`'s `Picker`, `MetricMappingManager`, the two project linkers, and a bare
`<select>` in `ScrumItemList`.

Promote **`components/sprints/LinkToOkrPopover.tsx`** to `components/ui/EntityPicker.tsx` —
it is the most complete (recents, cascading expand, both entity types).

> There are also **two different fetch strategies** for the same data: `LinkToOkrPopover`
> calls `/api/objectives?limit=200` *and* `/api/key-results?limit=500` and re-joins them
> client-side, while `CheckInPickerModal` calls `/api/objectives` alone and reads
> `keyResults` off the payload. **Consolidating the component without consolidating the
> fetch just moves the duplication.** Add `hooks/useOkrOptions.ts`.

### `SectionHeading` — extraction, not net-new

Seven hand-rolled variants, of which `AppleDashboard.tsx:68` and `AppleAnalytics.tsx:22`
are **byte-identical**. Extract the header row out of
`components/ui/dashboard/DashboardCard.tsx:14`, have `DashboardCard` consume it, and
delete both copies plus the duplicate `APCard` wrapper at `AppleDashboard.tsx:77`.

### `DueDateChip` — build, but it is a behaviour change

10–12 implementations of due-date tone logic, including a **byte-identical copy** of
`getDueDateStatus` between `MyTasksList.tsx:17-33` and `ToDoList.tsx:279-295`.
`TaskCardTrello.tsx:69-84` already has literally the proposed API
(`overdue | done | soon | neutral`).

> ⚠ **The implementations disagree semantically**, so extracting a shared helper changes
> behaviour somewhere:
> - "soon" is **≤2 days** in `TaskCardTrello` but **≤7 days** in `ReportDashboardClient`.
> - `TodoCardModal` renders "tomorrow" in a **success** tone; `SetDueDateButton` renders
>   "future" green and "tomorrow" orange.
>
> Pick one vocabulary deliberately and say so in the changelog. Put the helper in
> `lib/todos/due-tone.ts` — `lib/projects/schedule-view.ts` is the existing precedent.

The designs themselves carry **three different due-tone maps** (board card, to-do row,
checklist item) plus a fourth for the modal's due *button*. Reconcile to one.

### Do **not** build `CountChip`

Two equivalents already exist and neither is being used properly:
- `components/ui/dashboard/MiniBadge.tsx` — sunken-fill count pill, doc comment says
  "used for counts/status". 2 importers.
- `.ap-kbd` in `globals.css:1348` — mono, 10px, sunken fill, 5px radius. This is the
  proposed component almost to the pixel. **Zero call sites.**

Promote `MiniBadge` into the main barrel with `tone` and `mono` props; delete `.ap-kbd`
or wire it up. Adding a third way to render a count makes this worse, not better.

### Do **not** build `FloatingDock`

Exactly **one** fixed bottom-centre bar exists: `SprintFloatingBar.tsx:35`. The plan's
second consumer — the to-do bulk dock — **does not exist yet**. One real consumer plus
one speculative one does not justify a two-variant primitive. Leave it inline; extract
later if the bulk dock ships and matches.

### Primitives to extend, not replace

- **`Popover`** — width is hardcoded `w-[300px]`. The designs need 168, 176, 186, 190,
  232, 244, 252, 268, 272, 276, 290 and 420px. Add a `width` prop (number or token) and
  keep 300 as the default so existing call sites are unaffected.
- **`ScrollArea`** — renders a hardcoded vertical `<ScrollBar>`; the board lane scroller
  and the to-do table both need horizontal. Add an `orientation` prop.
- **`Modal`** — **50 importers, the highest-risk file in this plan.** Add sizes; never
  remap existing ones. Note the real gap is not that the max is too small: `2xl` is
  `sm:max-w-6xl` = 1152px, already *wider* than the design's 940px. What's missing is a
  **fixed-px** size. Also add the 6px top accent strip as an optional `accentColor` prop.
  > The design hardcodes that strip to `oklch(0.68 0.13 150)` and does **not** bind it to
  > the card's status — and that value matches no entry in the status colour map. An
  > earlier draft called it "status-coloured"; that was an interpretation. Either define
  > the mapping explicitly or keep it fixed.
- **`StatCard`** — its tones are raw Tailwind palette colours and `gray` maps to a
  typo'd `bg-muted0` (a dead class, absent from the built CSS). Retarget tones onto
  `--ap-*` while we're in here.
  > `bg-muted0` appears in **three** places, and the other two are worse than a wrong
  > tone: `features/todos/components/AssignUserModal.tsx:123` renders a transparent
  > avatar placeholder, and `features/objectives/components/ParentObjectiveSelector.tsx:208`
  > (`bg-muted0 bg-opacity-75`) is an **invisible modal backdrop**. Fix all three.

### Consolidations to do while touching these files

- **Avatars are implemented five different ways** across the to-dos page alone. Standardise
  on `components/shared/UserAvatar` + `lib/user-color`.
- **`StatusLozenge` is defined twice** with different colours and labels, and *neither*
  uses `lib/todo-status.ts` `TODO_STATUS_META`, which already exists for exactly this.
- **`TodoKanbanView` hardcodes its own 4-status `COLUMNS` const** with raw hex dots.
  Use `BOARD_STATUSES` instead — see §6.
- **`components/ui/progress.tsx` has zero consumers while `ProgressBar` is
  re-implemented seven times** — `OkrAttainmentSection`, `NestedObjectivesList`,
  `SprintBoardClient`, `SprintsListClient`, `ResultsList`, `OkrHierarchyTable`,
  `OkrsAllClient`. Adopt the primitive across all seven. The design's bar is a single
  spec: `height 6px; radius 99px; track --ap-kr-bar-bg; fill --ap-ok`.

### Delete while adding

The barrel currently holds 32 files and ~15 are unused or single-use. If this refresh
adds four without removing anything, it grows to 36 with the same dead weight.

**Zero external consumers** (referenced only by `components/ui/index.ts`):
`accordion.tsx` (81 lines), `alert-dialog.tsx` (199 — superseded by `ConfirmDialog`,
which has 33 importers), `progress.tsx` (adopt instead of deleting — see above),
`toggle-group.tsx` (89), `toggle.tsx` (47, whose only consumer is `toggle-group`).

**Dead CSS in `globals.css`:** `.ap-kbd` (:1348), `.ap-segmented` (:1227),
`.ap-progress` (:1331) — all zero call sites.

---

### 4.1 Idioms that are patterns, not components

Three recurring treatments that need a documented spec but not a new file.

**Dashed ghost affordance** — 7 instances, the design's standard "nothing here yet, add
something" control. `1px dashed`, colour varies with context:

| Use | Border | Hover |
|---|---|---|
| Add member / add label | `oklch(0.8 0.01 262)` | `bg oklch(0.96 0.004 262)`, `border oklch(0.68 0.012 262)` |
| Row "Link OKR" button | `oklch(0.86 0.01 262)` | `border oklch(0.7 0.1 255)`, `fg oklch(0.45 0.15 255)`, `bg oklch(0.97 0.02 255)` |
| "Add another list" (on board) | `oklch(1 0 0 / 0.9)` on `oklch(1 0 0 / 0.45)` | `bg oklch(1 0 0 / 0.75)` |
| Unassigned avatar | `oklch(0.82 0.01 262)` | none |

**Empty states** — the designs define three, none of which were in an earlier draft:

1. *Empty lane* — `18px 12px`, `1px dashed oklch(0.86 0.01 262)`, `10px` radius, centred,
   12.5px. Copy: *"Nothing stuck right now. Drag a card here when it needs help."*
2. *Unlinked OKR* (modal) — `12px 14px`, `1px dashed oklch(0.86 0.02 262)` on
   `oklch(0.975 0.006 262)`, with a 30px accent-tinted icon tile. Copy: *"Not linked —
   pick an objective or key result so progress rolls up."*
3. *Unassigned avatar* — 26px dashed circle with a plus glyph, `title="Unassigned"`.
   **This is the replacement for the `?` circle** flagged as a defect in §6.5.

Route 1 and 2 through `components/ui/EmptyState` (which already has a `bare` mode)
rather than hand-rolling.

**Segmented control** — 2× in the designs (the board's theme switcher and its
all/linked/unlinked filter), plus the existing `ThemeSwitcher`. Track:
`padding 3px; radius 9px; bg oklch(0.96 0.004 262); gap 2px`. Pills: `26px; 0 10px;
radius 7px; 12.5px/600`; active `#fff` + `oklch(0.26 0.015 262)`; inactive transparent +
`oklch(0.5 0.012 262)`. **No hover state is defined.**

> `.ap-segmented` already exists in `globals.css:1227` and has **zero call sites**.
> Retarget it and adopt it rather than adding a component — same treatment as `.ap-kbd`.

**Selection ring** — `box-shadow: 0 0 0 2px #fff, 0 0 0 4px oklch(0.55 0.14 255)`, used
for the selected swatch in both the board-background and label-colour pickers. There is
no equivalent in the codebase today.

## 5. Layout metrics

The design settles several measurements the app currently gets wrong.

| Surface | Today | Design |
|---|---|---|
| Sidebar, expanded | `w-[220px]` aside inside a `260px` grid column | **228px, both** |
| Sidebar, collapsed | `w-[52px]` aside inside a `4rem` grid column | **52px, both** |
| Top bar height | `h-12` (48px) | **54px** |
| Board lane width | `272px` | **286px** |
| "Add another list" | `272px` | **218px × 44px** |
| Card modal max-width | `860px` | **940px** |
| Card modal right rail | `200px` | **232px** |
| To-do table columns | n/a (8-col `<table>`) | `42px minmax(0,1fr) 300px 118px 46px 104px 36px` |

**The sidebar/grid mismatch is a live bug, not a redesign choice.** Today the aside is
`shrink-0` at 220px (`Sidebar.tsx:272`) inside a 260px column
(`DashboardShell.tsx:72,74,75`), leaving a 40px strip of bare `bg-background` on every
desktop page — 12px when collapsed (52px vs `4rem`). Nothing closes it: the aside *is*
the grid item, and the only className passed is placement (`lg:col-start-1 …`). The
`border-r` therefore lands 40px short of the content column. Setting both to 228px
fixes it.

Update `DashboardShell`'s grid *and* `Sidebar`'s aside together, and the `.ap-sidebar` /
`.ap-topbar` rules in `globals.css` alongside them.

> There is a **third** copy of these numbers: `app/globals.css:1376-1377` defines
> `.ap-sidebar { width: 220px }` / `[data-collapsed='true'] { width: 52px }`, but the
> aside uses `ap-glass`, not `ap-sidebar` — so that rule is unwired dead CSS. Either
> wire it up or delete it, but do not leave 228px defined in three places and applied
> from one.

---

## 6. Per-surface work

### 6.1 Sidebar — `components/layout/Sidebar.tsx`

Design changes: 228px, white (not glass), **5px dot markers replace Lucide icons** on
grouped nav items, mono section eyebrows ("MY WORK", "OKRS"), 32px rows at
`13px/500`, active row = `--ap-accent-soft` fill + `--ap-accent` text + weight 600 +
accent dot, `7px` row radius.

Keep unchanged: the collapsed icon rail and its portal flyout, the mobile drawer,
`getVisibleNavigationGroups` permission filtering, `useNavOpenState`, the
`okr-sidebar-collapsed` localStorage key, `isNavPathActive` / `getActiveNavContext`.

> The design shows only 3 nav sections; the app has **14 permission-gated groups**. The
> design is an excerpt, not a replacement IA. Do not delete nav groups.

### 6.2 Top bar — `components/layout/Header.tsx`

Design changes: 54px, centred 420px search field (currently a 280px right-aligned
button), `34px` height, `9px` radius, mono `⌘K` chip, 26px profile avatar.

**Deferred:** the participant avatar stack with `+N` overflow. It is new, and the design
does not settle where the list comes from (sprint members, card assignees, or department).
Note that `NavProgressCircles` already occupies that slot with real data — leave it.

Fix while here — both are pre-existing defects:
- The grid wrapper carries `border-b bg-card` *and* the `<header>` carries
  `ap-glass border-b`. Two bottom borders, and the opaque `bg-card` underneath defeats
  the glass `backdrop-filter`. Pick one.
- **The notifications dropdown is entirely fake** — a literal badge `3` and three
  hardcoded strings, with no `/api/notifications` route to back it. Either wire it to
  real data or ship it visibly empty. Do not restyle fiction.

The design's top bar also contains a "Default / Apple / Apple Pro" segmented control.
That is `ThemeSwitcher`, which currently sits in the same place — keep it.

### 6.3 Sprint board — `features/sprints/components/SprintBoardClient.tsx`

**The cleanest surface in this refresh** — the structure already matches, so it is close
to a pure restyle. Lanes go to 286px on `oklch(1 0 0 / 0.72)` with a `12px` radius,
`1px solid oklch(1 0 0 / 0.8)`, `10px` padding and `8px` gap; the card scroller takes
`max-height: calc(100vh - 340px)`. Cards get a `10px` radius, a **5px** cover strip (down
from `h-8`), 22×6px pill label chips, and the meta chip row (due / checklist / KR /
watching) at 21px with `6px` radius.

Card hover is specified: `border-color: oklch(0.72 0.1 255)` +
`box-shadow: 0 4px 12px -4px oklch(0.2 0.04 260 / 0.18)`.

The floating bar stays as `SprintFloatingBar` — see §4, `FloatingDock` is not being built.

**Deferred:** the per-lane `+` add-card button in the lane header (today quick-add lives
in one lane via `AddTaskInline`; adding it per-lane is a behaviour change). The empty-lane
dashed panel *is* in scope — it restyles an existing state, and its spec is in §4.1.

**Do not break any of these:**
- Drop positioning scans `[data-sprint-card]` child rects on `onDragOver`. That attribute
  lives on the card *wrapper*, not the card. Move it and drag-drop silently misplaces cards.
- `onCardKeyDown` (the keyboard lift/move path) is also on the wrapper and reads
  `liftedRef` / `localColumnsRef` / `isClosedRef` because it is defined before those
  values exist in render order.
- The drop indicator is rAF-throttled with a ref dedupe and stays mounted animating
  `height 0→10`. That is deliberate anti-jank.
- Closed-sprint read-only mode has **ten** separate suppression points. Carry all ten.
- Optimistic reorder + rollback, the `?card=` deep link (and its neutral
  "isn't available" message — that is SEC-5, do not make it disclose existence),
  the mobile lane tab strip, `quickAddSignal` as a counter rather than a boolean.

**Finish the dark-background fork while here.** `dark` is true for exactly one preset
(`graphite`) and is threaded to only six places. The floating bar, planner, background
picker, task cards, mobile tab strip and all modals do not fork — so on graphite the
floating bar cannot meet the 4.5:1 contrast the requirements doc demands.

Two board-specific consequences of the retarget:

- **`TaskCardTrello:193`** builds the URGENT stripe as a `repeating-linear-gradient`
  mixing `var(--ap-warn)` with a hardcoded `rgba(255,149,0,0.5)`. After the retarget the
  token becomes `oklch(0.72 0.14 70)` while the literal stays iOS orange — **the stripe
  becomes two different oranges.** Tokenise the second stop.
- **`SprintListManager:296,309` and `SprintPlannerView:69,123`** draw their lane borders
  with Tailwind's `border` (shadcn `hsl(var(--border))`), **not** `--ap-border`. They
  will not follow the retarget and will disagree with the board's own lanes. Move them
  onto the token.

### 6.4 Task card modal — `components/todos/TodoCardModal.tsx`

The largest single piece of work. 940px shell, `14px` radius, **6px status-coloured
accent strip at the top**, and a two-column grid `minmax(0,1fr) 232px`.

The design **restructures the left column**, it does not just restyle it:

- A 26px round complete-toggle sits inline, left of the title — replacing today's
  absolutely-positioned header action row. **This means removing the `pt-16` compensation
  on the left column and the `mt-4`/`mt-14` flip on the closed-sprint banner**, both of
  which exist only to clear that absolute header.
- Under the title: a metadata line of "in list" · status dropdown · "added {date} by
  {person}" — **minus the card-ID chip**, which needs a field the schema does not have
  (Decision 0: drop the element rather than add the column).
- Then a **responsive attribute grid** — `repeat(auto-fit, minmax(192px, 1fr))` — holding
  Members, Labels (spanning 2) and Due date, each under an eyebrow. Today these are a
  flat pill row plus a separate members row. This is a layout change over existing
  fields, so it is in scope.
  > **Priority is the fourth cell in the design.** The modal already has a `PriorityPill`,
  > so moving it into the grid is a restyle, not a new feature — keep it. Use the existing
  > `PRIORITY_COLORS` semantics (retargeted), not the design's four hues, two of which
  > have no token (§2.11).
- Linked-OKR card, Description, Checklist, then Comments and Activity.
- The comment composer gets the mono `⌘↵` hint.

**Deferred from the modal** — all §11 backlog, all for the same reason:

| Design element | Why deferred |
|---|---|
| Card-ID chip (`FIN-482`) | No such field on `Todo`. |
| Per-checklist-item due date and assignee popovers | `TodoChecklistItem` has no `dueDate`/`assigneeId`. |
| "Review steps" as a **named** checklist + "New checklist" popover | Implies N named checklists per todo. |
| "Hide checked" toggle | New feature. |
| **Tabbed** Comments/Activity | Today they are stacked, and that works. Presentational, but it is an IA change with no functional gain — restyle the existing stack. |
| Comment formatting toolbar (B / I / code / list) | `MentionEditor` has no toolbar. Attach already exists and stays. |
| Comment `Reply` / `React` links | No reaction model. |
| Start-date row in the dates panel | Confirm against the existing `DatesPanel`, which already handles start + due — if it has it, keep it; if not, do not add it. |

Right rail (232px): watch button, more-menu and close at the top, then "ADD TO CARD"
(Members, Labels, Checklist, Dates, Attachment, Cover, Link OKR) and "ACTIONS"
(Move, Copy link, Archive, Delete card).

**Preserve:** the `activePanel` single-slot state, all optimistic-update paths (members,
labels, checklist delete, comment delete, watch toggle), the `sprintClosed` gating,
`DatesPanel`'s internal state machine, `RichTextContent` as the sanitisation boundary
(SEC-6, asserted by `lib/security/redirect-safety.test.ts`), and the `z-[90]`/`z-[91]`
popover pairing that must stay above Radix's `z-50`.

**Data-model gaps — see §11.** The modal alone implies ~12 fields that may not exist,
starting with the card ID chip (`FIN-482`). All of them are listed in §11 rather than
assumed here.

**Delete while here:** `mode="drawer"` has no call sites — remove the branch, its Escape
handler and its portal. The design has no drawer.

### 6.5 To-dos list — `components/todos-page/TodosPageClient.tsx`

**Under Decision 0 this is a restyle, not a rebuild.** An earlier draft called it
"mostly net-new feature work" and budgeted it as the largest phase. It is not. The
features the design adds are **out of scope** and live in §11 as a backlog.

Exists today and gets restyled: search, 3 filters (scope/status/link), 3 view tabs, and
the table — which keeps its current 8 columns, its current data, and its current
behaviour.

Apply from the design: the table shell (`12px` radius, `1px` border, white fill,
`min-width: 940px`), the header strip as a mono eyebrow row on `--ap-bg-sunken` at 42px,
row padding `11px 14px`, row hover `oklch(0.975 0.004 262)`, the tab underline treatment
(38px, 2px accent bottom-border), the filter controls as `FilterSelect`, and the page
header (26px H1, the subtitle counts line, the two header buttons).

**Do not build** — all deferred to §11:

| Design element | Why deferred |
|---|---|
| Date grouping (Overdue / This week / Later) | New feature. Also needs a week-boundary product decision the design doesn't settle. |
| Row selection + select-all | New feature. |
| Bulk-action dock | New feature, and needs bulk PATCH endpoints that don't exist. |
| Priority column | New column. Priority exists in the model but has never been on this page. |
| Row meta line (checklist / comment counts) | Needs per-row aggregates the list query doesn't return. |
| Inline "Link OKR" on unlinked rows | New feature. The dashed-ghost *style* is specced in §4.1 for when it ships. |
| "Showing N of 150" | Needs a server total distinct from the loaded page. |
| "press N anywhere" | New shortcut. |

> The 7-column grid in the design exists to carry the priority column and the selection
> checkbox. With neither in scope, **keep the current 8-column table** and restyle it.
> Do not reshape the grid to a layout whose columns we aren't filling.

**Fix these pre-existing problems in the same pass:**

1. **`lib/stores/todo-store.ts:56` is a live crash.** It reads `data.todos`, but
   `GET /api/todos` returns the standard envelope `{ success, data }` (`apiSuccess()`,
   `lib/api/apiResponse.ts:45`). `data.success` is truthy, so `todos` is set to
   `undefined` — then `TodosPageClient.tsx:138` (`filteredRows`) and `:173` (`counts`)
   both throw `Cannot read properties of undefined (reading 'filter')` on the very next
   render. Every other store action (`todo-store.ts:64`, `:96`) throws afterwards too.
   This fires on the page's only refresh path — `onUpdated` on `TodoCardModal`
   (`TodosPageClient.tsx:384`) — i.e. **every time a user edits a to-do in the card
   modal.** Change to `data.data`. Fix the related `TodoItem.assignee` nullability
   mismatch so the two `as any` casts can go.
   > **The same bug exists at `lib/stores/notification-store.ts:31`** (`data.notifications`).
   > That store additionally calls `/api/notifications?limit=20` and
   > `PATCH /api/notifications/:id`, **neither of which exists** — both 404. The store has
   > **zero consumers** today, so it is not currently crashing anything. Either fix it
   > alongside the notifications work in §6.2 or delete it; do not leave it as a trap.
2. **The page knows only 4 of 6 statuses.** `IN_REVIEW` and `STUCK` fall through
   `StatusLozenge` to a raw uppercase string, have no kanban column, and get lumped into
   "open". Use `BOARD_STATUSES`.
   > **Decision 0 settles the design's own contradiction here.** The modal's dropdown
   > offers **six** statuses (incl. Cancelled), the board shows **five** lanes, and the
   > two files give the same status different dot colours — **board "Stuck" is amber
   > (`oklch(0.72 0.14 70)`), modal "Stuck" is red (`oklch(0.6 0.18 25)`)**.
   >
   > **`lib/todo-status.ts` is canonical.** Keep its status set and its semantics; take
   > only the *hues* from the retargeted tokens. Do not adopt either design's map, and do
   > not add or remove a status to match a mock.
3. ~~Move filter state to URL params.~~ **Deferred.** This was my suggestion, not the
   design's, and it changes navigation behaviour. Filters stay in `useState`. Logged in
   §11 as backlog.
4. **`todoViewMode: 'modal' | 'sidebar'`** is loaded, toggled and persisted to the
   database — and never consumed. The button changes a stored preference with no visual
   effect. Either wire it or remove it.
5. **The page crosses token systems mid-render.** `TodosPageClient` is 100% `--ap-*`;
   `TodoKanbanView` and `TodoTreeView` are 100% Tailwind-config tokens. Switching from
   List to Board crosses systems. Move both views onto `--ap-*`.
6. `CreateTodoModal` is a hand-rolled `fixed inset-0` overlay — move to
   `components/ui/Modal` per CLAUDE.md. Its form state is raw `useState` — move to
   `react-hook-form`. Its assignee `<select>` has no "Unassigned" option despite
   initialising to `''`.
7. Row delete uses native `window.confirm` — use `ConfirmDialog`.
8. The "Owner" column header renders `assignee`, and unassigned rows get a `?` circle
   with a tooltip reading "Assigned to " with an empty name.
9. The description preview strips tags with `.replace(/<[^>]+>/g,'')` inside
   `dangerouslySetInnerHTML`. Use `textContent` or strip server-side.

Also note: `app/dashboard/todos/page.tsx` **queries Prisma directly in the route**, which
violates the CLAUDE.md "routes are thin composition only" rule. Moving it into a service
is optional here but should be logged as debt.

---

## 7. Cleanup this refresh should absorb

Dead code — delete outright:

| File | Lines | Note |
|---|---|---|
| `features/sprints/components/SprintCardModal.tsx` | 810 | Only referenced by the barrel. Its own header says "removed in Phase 4". Holds most of the repo's remaining raw hex and ~14 malformed `text-[color:var(--text-sm …)]` classes that emit nothing. Delete the barrel line too. |
| `components/todos-page/TodoDetailPanel.tsx` | 325 | **Zero references anywhere in the repo** — not even a barrel re-export; the only match is its own definition. Superseded by `TodoCardModal`. |
| `SprintBoardActivity` type | ~18 | Exported for back-compat, imported by nothing. |
| `.notion-*` / `.atlas-*` blocks in `globals.css` | ~800 | Two full theme scopes unreachable from `ThemeSwitcher`. |
| `TodoCardModal` drawer branch | ~30 | No call sites — all four consumers resolve to `'modal'`. Dead branches: the Escape listener at `:886` (guarded by `if (mode !== 'drawer') return`, so it never runs) and `isDrawer` at `:1345` (always false). Also fix the stale doc comment at `SprintBoardClient.tsx:8` claiming it opens "in drawer mode". |

Defects to fix:

- **`font-500` / `font-600` / `font-700` appear 80 times and do nothing.** Not valid
  Tailwind v3 utilities, not defined in config or globals — verified absent from the
  built CSS. Those elements render at default weight today. Breakdown: `font-600` ×45,
  `font-700` ×23, `font-500` ×12 — and **70 of the 80 are in `TodoCardModal.tsx` alone**,
  so Phase 5 absorbs almost all of this. Replace with `font-medium` / `font-semibold` /
  `font-bold`.
- **`BoardTodo.checklists` declares `{ done: boolean }`** but the API returns `completed`
  (`app/api/sprints/[id]/board/route.ts:24`, matching `TodoChecklistItem.completed` in
  the schema) and `TaskCardTrello` reads `completed`. It only compiles because of the
  `as unknown as TrelloTodo` cast at `SprintBoardClient.tsx:933`.
  > **Runtime is currently correct — this is a type-only defect.** Fix `BoardTodo` and
  > drop the cast. Do **not** "fix" `TaskCardTrello` to read `done`; that would break
  > the checklist badge.
- **Broken CSS var names** in `ToDoList.tsx` and `AddToDo.tsx` — a Tailwind class name
  was pasted inside `var()`, e.g. `text-[color:var(--text-sm text-muted-foreground)]`.
  These resolve to nothing.
- `DatesPanel` renders **two identical close buttons** flanking its title.
- `TodoTreeView.tsx:190` has `className="w-12 h-1 w-full"` — conflicting widths.
- Bare `appearance-none` checkboxes in `TodoTreeView` / `ToDoList` render as empty boxes
  with **no visible checked state**.
- `getConfidenceColor` is mandated by CLAUDE.md but **does not exist**. Either add it to
  `lib/utils.ts` or drop the mandate.

---

## 8. Sequencing

Each phase should land and be verifiable on its own.

| # | Phase | Contents | Gate |
|---|---|---|---|
| 0 | Fix the crash | `todo-store.ts` envelope bug + nullability | Editing a to-do in the card modal no longer throws |
| 1 | Token retarget | §2 values, §2.5–2.8 follow-ups, §3 dark wiring, all 5 font edits, the hardcoded-radius sweep, the 4 satellite copies | **Full-app visual review** — ~124 files outside this redesign change. Not a four-screen check. |
| 2 | Primitives | §4 new components + extensions + consolidations | Storybook-less visual check; barrel exports updated |
| 3 | Shell | Sidebar + top bar + the 228px grid fix | Sidebar border meets the content column; no dead strip |
| 4 | Sprint board | §6.3 restyle + finish the dark fork | Drag-drop, keyboard move, closed-sprint mode all still pass |
| 5 | Card modal | §6.4 — relayout the header/attribute grid, then restyle | All optimistic paths and `sprintClosed` gating intact; 70 dead `font-*` classes gone |
| 6 | To-dos list | §6.5 — **restyle only**, plus the listed defect fixes | Table, filters and tabs restyled; no behaviour change; `tsc` clean |
| 7 | Cleanup | §7 deletions and remaining defect fixes | `tsc` clean; no `font-5/6/700` remaining |

Phase 1 is the highest-leverage and lowest-risk step: it changes how everything looks
without touching a single component. Do it first and review it before building anything.

> **Decision 0 rebalances this.** Phase 6 was the largest phase when the to-dos list was
> scoped as feature work; it is now one of the smallest. Phases 1 and 5 are the bulk —
> Phase 1 because the blast radius is ~124 files, Phase 5 because `TodoCardModal` is
> 2,480 lines and carries 70 of the 80 dead weight classes.

---

## 9. Explicitly out of scope

**Everything in §11.** Under Decision 0, every feature, field, API change and product
decision the designs imply is out of scope by default. §11 is the record of them.

Also out of scope:

- The `--ap-card-*` label/cover palette (persisted in the DB — changing it orphans saved labels).
- The 14-group navigation IA (the design shows an excerpt).
- `date-picker.tsx`'s injected `.apdp-*` stylesheet. It will inherit the token values but
  its structure is not being rebuilt in this pass. Flagged as the least restylable
  primitive in the codebase.
- Migrating the board from HTML5 drag-and-drop to `@dnd-kit` (a documented deliberate
  deviation; see the comment block in `SprintBoardClient`).
- Any change to `lib/todo-status.ts`'s status set or semantics.
- Any change to the board or list API shapes.

**In scope despite Decision 0**, because they are not features:

- The defect fixes in §7 and in §6.5 — a crash, dead classes, an invisible backdrop and a
  fragile HTML strip are bugs, not design decisions.
- The WCAG corrections in §2, which override the design's own values *and* the current
  ones.
- The reuse consolidations in §4, which reduce surface rather than adding it.

---

## 10. Tracker

| Phase | Status | Owner | Notes |
|---|---|---|---|
| 0 — crash fix | **Done** 2026-09-17 | Claude | `data.data` + Array.isArray guard; nullable assignee; both `as any` removed |
| 1 — token retarget | **Done** 2026-09-17 | Claude | Tokens on `:root`; WCAG-corrected values; dark wired; fonts; 294 radii swept; backgrounds merged. **No browser check yet.** |
| 2 — primitives | Not started | | |
| 3 — shell | Not started | | |
| 4 — sprint board | Not started | | |
| 5 — card modal | Not started | | |
| 6 — to-dos list | Not started | | Restyle only — features deferred to §11 |
| 7 — cleanup | Not started | | |

---

## 11. Backlog — what the designs imply that we are not building

**Decision 0 answers almost all of this: existing wins, so none of it is in scope.**
This section is a *backlog*, not a question list. It exists so the ideas are not lost and
so nobody re-derives them from the mocks later.

**Nothing below is built in this refresh.** Each row needs its own product decision and
its own estimate, separately from the visual work.

### Resolved by Decision 0 — existing implementation is canonical

| The design shows | We keep |
|---|---|
| 6 statuses in the modal, 5 lanes on the board | `lib/todo-status.ts` — its set, its semantics |
| Board "Stuck" amber vs modal "Stuck" red | The existing status colour map, retargeted to new hues |
| Label defs carrying a `bg`/`fg`/`dot` triple | The existing single-hex `CARD_PALETTE` |
| Board label vocabulary ≠ modal label vocabulary | Whatever the DB holds; labels are user data |
| Lane counts as **server totals** distinct from loaded cards | The existing board API — no per-lane aggregates, no lane pagination |
| `Showing 12 of 150`, `150 open · 99 overdue` | The existing list query — no separate totals |
| Row checklist/comment counts | The existing list payload — no per-row aggregates |
| KR picker showing `· 55%` progress | The existing picker payload |
| Objective ordinals (`2 — Achieve tax compliance…`) | No sequence field |
| 3 nav sections | The existing 14 permission-gated groups |
| The 7-column to-do grid | The existing 8-column table |

### Backlog — features (not scoped, not estimated)

- Date grouping on the to-dos list (Overdue / This week / Later), collapsible, tone-coded.
  Needs a week-boundary decision — the design's calendar renders **Su-first** while the
  group hint reads "May 25 — May 31" (Mon-first). It contradicts itself.
- Row selection + select-all, and the bulk-action dock (Mark done / Assign / Set due
  date). Needs bulk PATCH endpoints.
- Priority column on the to-dos list.
- Inline "Link OKR" on unlinked rows. Style is already specced in §4.1.
- "Hide checked" on checklists; named/multiple checklists per card.
- Tabbed Comments/Activity in the card modal.
- Comment formatting toolbar; comment reactions (`React` link).
- Per-lane add-card button on the board.
- Topbar participant avatar stack with `+N`.
- Filter and view state in the URL (my suggestion, not the design's).
- Quick due-date presets (`Today`, `Tomorrow`, `Next Monday`) and the derived
  `· overdue by 3 days` note.
- A keyboard-shortcut registry (`press N anywhere`, `⌘↵`, `⌘K`).

### Backlog — would need a schema change

| Implied by | Field |
|---|---|
| `FIN-482` chip | Card short-code |
| Checklist item popovers | `TodoChecklistItem.dueDate`, `.assigneeId` |
| "New checklist" popover with a title | N named checklists per todo |
| `May 22 · 5:00 PM` | Due date as `DateTime` rather than `Date` |
| Dates panel "Start date" row | `Todo.startDate` — **verify first**, `DatesPanel` may already handle it |
| "added Jul 14 by Yohannes" | `Todo.createdById` distinct from assignee |
| "Watching" toggle + card eye icon | Watcher/subscription table — **verify first**, `/api/watchers` exists |
| Comment `React` link | Reaction model |
| Cover `repeating-linear-gradient(...)` | Covers as **patterns**, not just hex — `CARD_PALETTE` only models colour |

### Resolved

1. **Board backgrounds** — decided, see §2.9 below. Merge both sets, keep every existing
   key.
2. **The `default` theme** — decided, see §3.1. Tokens move to `:root`; the tab is removed.
3. **`.ap-glass`** — §2.7. Change it to read `--ap-border` instead of its hardcoded rgba,
   so the header and sidebar stop keeping the old border after the retarget.

---

## 12. Docs to update as phases land

Per `CLAUDE.md`: `docs/CHANGELOG_AI.md` every time; `docs/COMPONENT_CATALOG.md` for every
new or changed primitive in §4; `docs/DESIGN_SYSTEM.md` §12 for the token retarget, the
resolved focus-style conflict (§2 accent) and the
resolved radius/typography divergences; `docs/MASTER_REFERENCE.md` after the work
completes.

`docs/FEATURE_STATUS.md` needs **no** entry from this refresh — under Decision 0 no
feature status changes. If the §11 backlog is ever picked up, that is when it moves.
