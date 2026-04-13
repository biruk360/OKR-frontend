# Project Architecture — Developer & AI Guide

> **AI:** Read this file and `COMPONENTS.md` before doing anything else.
> **Developer:** This document explains the entire system. Start here.

---

## What this system is

A self-documenting, modular, AI-efficient codebase with two parallel stacks:

| Stack | Tech | State | Location |
|-------|------|-------|----------|
| Web | React, Next.js, TypeScript | Zustand | `web/` |
| Mobile | Flutter, Dart | Riverpod | `mobile/` |

Both stacks share the same architecture, conventions, and living documents.

---

## The 5 living documents (always up to date)

| File | What it tracks | Updated by |
|------|---------------|------------|
| `COMPONENTS.md` | Every reusable component, store, service, utility | AI — after creating any new shared item |
| `FEATURES.md` | Every feature's build status (✅ 🔄 ⏳ 🚫) | AI — after completing any task |
| `SITEMAP.md` | Every screen, route, and modal | AI — after creating any new screen |
| `CHANGELOG.md` | Timestamped log of every change | AI — mandatory after every task |
| `AI_PROMPT.md` | The global AI prompt template (source of `.cursorrules`) | Human — when conventions change |

---

## Architecture — 4 layers

```
┌─────────────────────────────────────────┐
│  Layer 4 — App Shell                    │  Router, entry point, global providers
│  Imports from: all layers               │
├─────────────────────────────────────────┤
│  Layer 3 — Feature Modules              │  features/auth, features/dashboard, …
│  Imports from: Layer 1 + 2 only        │  ← NEVER import between features
├─────────────────────────────────────────┤
│  Layer 2 — Shared                       │  components, stores, services, hooks, utils
│  Imports from: Layer 1 only            │
├─────────────────────────────────────────┤
│  Layer 1 — Foundation                   │  tokens: colors, spacing, typography
│  Imports from: nothing                 │
└─────────────────────────────────────────┘
```

**The one rule that matters most:** Features never import from other features. All shared logic lives in `shared/`.

---

## Folder structure

```
/
├── COMPONENTS.md          ← AI reads before every task
├── FEATURES.md            ← live progress tracker
├── SITEMAP.md             ← full screen map
├── CHANGELOG.md           ← full change history
├── AI_PROMPT.md           ← global AI prompt (human-readable)
├── .cursorrules           ← auto-injected into Cursor every session
├── .cursorignore          ← excludes build artifacts from AI indexing
│
├── _templates/
│   ├── CONTEXT.template.md        ← copy into every new feature module
│   └── NEW_FEATURE_CHECKLIST.md   ← follow when adding any new module
│
├── web/                   ← React + Next.js + Zustand
│   └── src/
│       ├── foundation/    ← Layer 1: tokens (colors, spacing, typography)
│       ├── shared/        ← Layer 2: components, stores, services, hooks, utils
│       │   └── components/index.ts   ← barrel: AI reads this
│       ├── features/      ← Layer 3: one folder per feature
│       │   └── [module]/
│       │       ├── CONTEXT.md    ← AI reads before working on this module
│       │       ├── components/
│       │       ├── screens/
│       │       ├── stores/
│       │       ├── services/
│       │       └── types/
│       └── app/           ← Layer 4: router, shell, global providers
│
└── mobile/                ← Flutter + Riverpod
    └── lib/
        ├── foundation/    ← Layer 1: tokens
        ├── shared/        ← Layer 2: components, providers, services, utils
        │   └── components/index.dart  ← barrel: AI reads this
        ├── features/      ← Layer 3: one folder per feature
        │   └── [module]/
        │       ├── CONTEXT.md
        │       ├── widgets/
        │       ├── screens/
        │       ├── providers/
        │       ├── services/
        │       └── models/
        └── app/           ← Layer 4: go_router, main.dart
```

---

## Working with Cursor (AI tool)

**`.cursorrules` is auto-injected** — every Cursor AI session automatically starts with the full build rules and logging instructions. You do not need to paste anything manually.

**For new feature work**, also paste the relevant `CONTEXT.md` into your prompt for faster, more accurate results.

**Adding a new module?** Follow `_templates/NEW_FEATURE_CHECKLIST.md` step by step.

---

## Naming conventions

| Thing | Web (TS) | Mobile (Dart) |
|-------|----------|---------------|
| Component files | `MyComponent.tsx` | `my_component.dart` |
| Component classes | `MyComponent` | `MyComponent` |
| Store files | `useMyStore.ts` | — |
| Provider files | — | `my_provider.dart` |
| Service files | `myService.ts` | `my_service.dart` |
| Service classes | `MyService` | `MyService` |
| Type/model files | `myTypes.ts` | `my_model.dart` |
| Barrel files | `index.ts` | `index.dart` |

---

## The golden rules (quick reference)

1. **Check `COMPONENTS.md` before building anything** — if it exists, reuse it.
2. **No hardcoded values** — always use `foundation/tokens/`.
3. **Business logic in services** — never in components or screens.
4. **State in stores/providers** — never in local `useState` for shared data.
5. **Features never import from each other** — only from `shared/`.
6. **Every folder has a barrel export** — `index.ts` or `index.dart`.
7. **AI always logs changes** — `CHANGELOG.md`, `FEATURES.md`, `COMPONENTS.md`, `SITEMAP.md`.
