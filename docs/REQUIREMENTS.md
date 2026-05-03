# Requirements Index

> **Purpose:** Central index of all feature requirement / specification documents for the OKR Management System. Each row points to a standalone spec doc that contains the full functional requirements, data model changes, API surface, UI touchpoints, and acceptance criteria for a feature.
>
> **How to use this file:**
> - When scoping a new feature, add a row here AND create the detailed spec at `docs/<FEATURE_NAME>.md`.
> - When a spec is updated materially, bump the **Last Updated** date here.
> - When a feature ships, change **Status** to `SHIPPED` and link the matching `docs/FEATURE_STATUS.md` row.
> - Acceptance criteria live in the spec doc, NOT here. This index stays a one-line-per-feature directory.

## Status legend
- **DRAFT** — Spec is being written, not yet reviewed.
- **APPROVED** — Spec reviewed and signed off, ready to build.
- **IN PROGRESS** — Implementation underway.
- **SHIPPED** — Built, deployed, and tracked in `FEATURE_STATUS.md`.
- **DEFERRED** — Approved scope, parked for now.
- **REJECTED** — Considered and decided against (kept for history).

---

## Active requirements

| # | Feature | Status | Spec | Owner | Last Updated | Notes |
|---|---------|--------|------|-------|--------------|-------|
| 1 | AI Sprint Planning (bi-weekly, with carryover) | DRAFT | [AI_SPRINT_PLANNING.md](AI_SPRINT_PLANNING.md) | TBD | 2026-05-03 | 5 open questions in spec §11; gated by `OrganizationSettings.aiSprintPlanningEnabled` |

## Shipped requirements

_None yet — once a feature lands in production, move its row here and add a `Shipped:` date column._

## Deferred / rejected

_None yet._

---

## Authoring conventions for spec docs

Every spec doc under `docs/` should include these sections, in this order, so reviewers know where to look:

1. **Production state observed** — counts and sparseness signals from the live DB at spec time, so future readers know what assumptions held.
2. **Concept** — one-paragraph plain-English summary.
3. **Functional requirements** — split into numbered subsections.
4. **Integration / algorithm design** (if applicable) — model choice, math, third-party calls, caching.
5. **Data model changes** — Prisma snippets; flag whether `preflight.sql` is needed.
6. **API surface** — table of endpoints with auth + RBAC notes.
7. **Permissions** — role × scope matrix.
8. **UI touchpoints** — file paths in `features/` / `components/` / `app/`.
9. **Non-functional requirements** — latency, cost caps, feature flags, privacy.
10. **Acceptance criteria** — numbered, each independently testable; reference fields/columns by exact name.
11. **Open questions** — explicit list, resolved before status flips to APPROVED.
12. **Suggested build order** — so the implementer can sequence without re-deriving it.

If a section doesn't apply, write "N/A — <one-line reason>" rather than omitting it.
