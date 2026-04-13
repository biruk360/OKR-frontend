# Changelog
> **AI instruction:** After completing any task, append a new entry at the TOP of the log below (most recent first).
> Use the exact format. Be specific — list every file touched.

---

## Log format (copy this template for each entry)

```
---
### [YYYY-MM-DD HH:MM] — {task title}
**Summary:** One sentence — what was built or changed.
**Files created:**
- path/to/new/file.ts
**Files modified:**
- path/to/changed/file.ts
**Components reused:** List components from COMPONENTS.md that were used (or "none")
**New components added:** List new shared components added to COMPONENTS.md (or "none")
**Features updated:** FEATURES.md IDs whose status changed (e.g. S-001 ✅, A-002 🔄)
**Screens added:** Screens appended to SITEMAP.md (or "none")
**Notes:** Anything the next developer or AI session should know.
---
```

---

## Entries (most recent first)

<!-- AI appends new entries here -->

---
### [Project initialized] — Scaffold created
**Summary:** Project scaffold, folder structure, and all 5 living documents created.
**Files created:**
- COMPONENTS.md
- FEATURES.md
- SITEMAP.md
- CHANGELOG.md
- AI_PROMPT.md
- .cursorrules
- .cursorignore (web + mobile)
- web/src/foundation/tokens/ (colors, typography, spacing)
- web/src/shared/components/index.ts
- web/src/shared/stores/index.ts
- web/src/shared/services/index.ts
- web/src/shared/hooks/index.ts
- web/src/shared/utils/index.ts
- mobile/lib/foundation/tokens/ (colors, typography, spacing)
- mobile/lib/shared/components/index.dart
- mobile/lib/features/auth/CONTEXT.md
- mobile/lib/features/dashboard/CONTEXT.md
- web/src/features/auth/CONTEXT.md
- web/src/features/dashboard/CONTEXT.md
**Components reused:** none (initial scaffold)
**New components added:** none (initial scaffold)
**Features updated:** none
**Screens added:** none
**Notes:** All future tasks must start by reading COMPONENTS.md and the relevant CONTEXT.md. Use .cursorrules as the injected global prompt in Cursor.
---
