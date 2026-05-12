# AI_PROMPT.md — Global AI Prompt Template
> Copy everything below the divider and paste it before any task you give the AI.
> In Cursor, this is already injected automatically via `.cursorrules` — no paste needed.
> Keep this file in sync with `.cursorrules`.

---
---

## IDENTITY — read this first

You are working on a cross-platform application with two codebases:

**Web** (`web/`) — React + Next.js, TypeScript, Zustand (state), Tailwind CSS  
**Mobile** (`mobile/`) — Flutter, Dart, Riverpod (state)

Architecture: 4-layer modular system.
- Layer 1 `foundation/` — tokens, theme, constants. No imports from other layers.
- Layer 2 `shared/` — reusable components, stores, services, hooks, utils. Imports from Layer 1 only.
- Layer 3 `features/` — vertical feature modules. Imports from Layer 1 & 2 only.
- Layer 4 `app/` — router, shell, providers. Imports from all layers.

**Cross-feature imports are forbidden.** `features/invoicing` cannot import from `features/hr`. Use `shared/` for cross-cutting logic.

---

## BEFORE YOU WRITE ANY CODE — mandatory pre-read

1. Run a reuse audit first — check existing packages/libraries, `COMPONENTS.md`, feature modules, routes, shared UI, services, utilities, hooks, stores/providers, tokens, and established UI patterns.
2. Read `COMPONENTS.md` — check if a component matching your need already exists. If yes, reuse it. Do not duplicate.
3. Read the `CONTEXT.md` inside the relevant feature module folder.
4. If creating a new screen, check `SITEMAP.md` for existing routes.
5. If unsure whether something belongs in `shared/` or `features/`, ask. Default: if two or more features would use it → `shared/`.
6. Only create something new when existing packages, libraries, components, features, UI, or tokens do not fulfill the need. Prefer extending the closest existing abstraction and document the gap the new code fills.

---

## BUILD RULES — follow these exactly

- **Reuse before build.** If COMPONENTS.md lists it, use it. Only build new if nothing matches.
- **No new thing before the reuse audit passes.** Do not add a dependency, component, token, UI pattern, feature module, service, utility, hook, store, or provider until the existing system is confirmed insufficient.
- **No hardcoded values.** Colors → `foundation/tokens/colors`. Spacing → `foundation/tokens/spacing`. Text → `foundation/tokens/typography`. Never inline hex codes, px values, or font sizes.
- **Business logic in services, not components.** Components call services. Services contain logic.
- **State via stores only.** Web: Zustand stores in `shared/stores/` or `features/[module]/stores/`. Mobile: Riverpod providers in `shared/providers/` or `features/[module]/providers/`. No `useState` for shared state.
- **Every folder must have a barrel export file.** Web: `index.ts`. Mobile: `index.dart`. Import from the barrel, never from individual files directly.
- **Naming:** Components → `PascalCase`. Files → `camelCase.ts` (web) / `snake_case.dart` (mobile). Stores → `useXxxStore` (web) / `xxxProvider` (mobile). Services → `XxxService`.
- **No `any` type in TypeScript.** Define types. If you don't know the type, use `unknown` and add a TODO.
- **New shared component?** Add it to `COMPONENTS.md` immediately after creating it.
- **New screen?** Add it to `SITEMAP.md` immediately after creating it.

---

## COMPONENT STRUCTURE RULES

**Atoms** — single-responsibility, no business logic, accepts only primitive props + callbacks.  
**Molecules** — composed of atoms, may have local UI state, no store access.  
**Organisms** — composed of molecules/atoms, may access stores, may call services.  
**Feature screens** — compose organisms, access feature store, call feature services, handle navigation.

---

## AFTER COMPLETING ANY TASK — mandatory logging

When you finish a task, you **must** update these files. Do not skip this step.

### 1. Append to `CHANGELOG.md` (at the top, most recent first):
```
---
### [YYYY-MM-DD HH:MM] — {task title}
**Summary:** One sentence describing what was done.
**Files created:** list every new file with path
**Files modified:** list every changed file with path
**Components reused:** names from COMPONENTS.md (or "none")
**New components added:** names + where added to COMPONENTS.md (or "none")
**Features updated:** FEATURES.md IDs and new status (e.g. S-001 ✅)
**Screens added:** routes/names added to SITEMAP.md (or "none")
**Notes:** anything relevant for the next session
---
```

### 2. Update `FEATURES.md`:
Find the relevant feature row(s). Change the status column to the correct symbol:
- `✅` completed · `🔄` in progress · `⏳` pending · `🚫` blocked
Update the module summary table totals.

### 3. Update `COMPONENTS.md` (if a new shared component was created):
Append a row to the correct table (atoms / molecules / organisms / stores / services / utils).
Format: `| ComponentName | key props | shared/path | feature modules using it | stack |`

### 4. Update `SITEMAP.md` (if a new screen, modal, or route was created):
Append a row to the correct module section.
Format: `| /route · module/route | ScreenName | Type | Auth | Stack | Status |`

---

## CONTEXT reminder
This project uses:
- **Web:** React, Next.js (App Router), TypeScript, Zustand, Tailwind CSS
- **Mobile:** Flutter, Dart, Riverpod, go_router
- **API:** REST (base URL from `shared/utils/constants`)
- **Auth:** JWT — token in `useAuthStore` (web) / `authProvider` (mobile)
- **Offline:** NetworkStore tracks sync queue; offline-first on mobile

---
