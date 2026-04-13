# New Feature Checklist
> Follow this every time you add a new module to the application.
> Hand this to the AI as part of your prompt when bootstrapping a new feature.

---

## Step 1 — Plan (do this before writing code)

- [ ] Define the module name (e.g. `invoicing`, `reports`, `settings`)
- [ ] List all screens the module needs
- [ ] Identify which shared components it will use (check `COMPONENTS.md`)
- [ ] Identify what state it needs (new store / provider, or reuse shared?)
- [ ] Define the API endpoints it will call
- [ ] Add feature rows to `FEATURES.md` with status `⏳ Pending`

## Step 2 — Create the folder structure

**Web:**
```
web/src/features/[module]/
├── CONTEXT.md           ← copy from _templates/CONTEXT.template.md and fill in
├── components/          ← module-specific widgets only (not shared)
│   └── index.ts
├── screens/             ← page components
│   └── index.ts
├── stores/              ← Zustand store(s) for this module
│   └── [module]Store.ts
├── services/            ← API calls and business logic
│   └── [module]Service.ts
└── types/               ← TypeScript interfaces and types
    └── index.ts
```

**Mobile:**
```
mobile/lib/features/[module]/
├── CONTEXT.md           ← copy from _templates/CONTEXT.template.md and fill in
├── widgets/             ← module-specific widgets only
│   └── index.dart
├── screens/             ← screen widgets
│   └── index.dart
├── providers/           ← Riverpod provider(s)
│   └── [module]_provider.dart
├── services/            ← API + business logic
│   └── [module]_service.dart
└── models/              ← Dart data classes
    └── index.dart
```

## Step 3 — Fill in CONTEXT.md

Copy `_templates/CONTEXT.template.md` into the new module folder.
Fill in: purpose, screens, components used, state, services, API endpoints, key types.

## Step 4 — Register routes

**Web:** Add route(s) to `web/src/app/router/`
**Mobile:** Add route(s) to `mobile/lib/app/router/`
Add screen rows to `SITEMAP.md`.

## Step 5 — Build (give the AI this prompt pattern)

```
[paste .cursorrules / AI_PROMPT.md]

Read first:
- COMPONENTS.md (root)
- features/[module]/CONTEXT.md

Task: Build [specific screen or feature].

Rules:
- Reuse components listed in CONTEXT.md before creating new ones
- State goes in features/[module]/stores/[module]Store.ts (web) 
  or features/[module]/providers/[module]_provider.dart (mobile)
- Business logic goes in features/[module]/services/[module]Service.ts
- When done, update CHANGELOG.md, FEATURES.md, and SITEMAP.md
```

## Step 6 — After each AI task, verify

- [ ] `CHANGELOG.md` has a new entry at the top
- [ ] `FEATURES.md` status updated for completed items
- [ ] `COMPONENTS.md` updated if any new shared component was created
- [ ] `SITEMAP.md` updated if any new screen was added
- [ ] No cross-feature imports introduced
- [ ] No hardcoded colors, spacing, or font sizes

---

## Anti-patterns to avoid

| ❌ Don't | ✅ Do instead |
|---------|-------------|
| `import '../../hr/models/user.dart'` | Move shared type to `shared/models/` |
| `color: Color(0xFF2563EB)` | `color: AppColors.primary` |
| `fontSize: 16` | `style: AppTypography.body` |
| Duplicate `LoadingSpinner` in your feature | Import from `shared/components` |
| `useState` for data shared across screens | Put it in the Zustand/Riverpod store |
| Logic inside a widget `build()` method | Move to a service method |
