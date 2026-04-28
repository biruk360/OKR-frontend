# Reports & Dashboards

Single-source reference for the `/dashboard/reports` page and the dashboard infrastructure that powers it. Pair with [NOTIFICATIONS.md](./NOTIFICATIONS.md) for cross-system context.

## Surfaces

| Route | Audience | Purpose |
|---|---|---|
| `/dashboard` | Every authenticated user | Personal home — owned objectives, recent activity, pulse |
| `/dashboard/reports` | Every authenticated user | Reports super-page with three modes (CEO / Employee / Detailed) |
| `GET /api/dashboards/ceo` | ADMIN + EXECUTIVE | Live CEO payload (denormalized) |
| `GET /api/dashboards/me` | Any authenticated user | Live employee payload, scoped to the caller |

## Mode switcher

The Reports client renders one of three modes via the segmented control at the top:

- **CEO Super Dashboard** — company-wide hero KPIs, operating trajectory, status mix, recommendation engine, distribution chart, department heatmap, owner workload, plan health.
- **Employee Dashboard** — same widget grid but scoped to the user's owned/contributed/assigned OKRs and labelled differently ("Personal outcome trajectory", "Team context", "People linked to your scope").
- **Detailed reports** — Objectives / Key Results / Initiatives / Data Improvements tabs with filters.

The CEO segment is **only visible to ADMIN + EXECUTIVE**; everyone else lands on Employee mode and the segmented control collapses to just the action buttons. The server-side `/api/dashboards/ceo` enforces the same gate (returns 403 to lower roles).

## Data flow

```
/dashboard/reports/page.tsx (server component)
        │
        ▼  loadDashboardPayload(scope, userId)
lib/dashboards/payload.ts ──────────► same shape as
        │                              /api/dashboards/{ceo,me}
        ▼
ReportDashboardClient (client component)
        │
        ├─ super metrics (memoised, in-client aggregation)
        ├─ super dashboard widgets (CEO + Employee mode share the SuperDashboard component)
        └─ detailed tabs (filters, sort, presets)
```

The page server-renders with the right scope based on session role. The two API routes return the **same shape** as the page payload so a future SWR refresh / Pusher push can swap in fresh data without re-mounting the client.

## Scope rules

`loadDashboardPayload(scope, userId)`:

- `scope === 'ceo'` → all `status: ACTIVE` objectives
- `scope === 'me'` → objectives where the user is owner / KR owner / assigned initiative / contributor

Both scopes always:
- include all active KRs of returned objectives
- include all KR-linked todos (capped at 500)
- return filter dictionaries (active users / departments / timeframes)

## Permission gate

| Capability | ADMIN | EXECUTIVE | DEPARTMENT_LEAD | EMPLOYEE |
|---|---|---|---|---|
| See CEO mode | ✅ | ✅ | ❌ | ❌ |
| Hit `/api/dashboards/ceo` | ✅ | ✅ | ❌ (403) | ❌ (403) |
| See Employee mode | ✅ | ✅ | ✅ | ✅ |
| Hit `/api/dashboards/me` | ✅ | ✅ | ✅ | ✅ |
| Detailed tabs (filtered to own scope) | ✅ | ✅ | ✅ | ✅ |

## Reusable primitives

Located at [`components/ui/dashboard/`](../components/ui/dashboard/index.ts):

| Component | Purpose |
|---|---|
| `DashboardCard` | Card wrapper with eyebrow header + optional right slot. |
| `InsightTile` | Hero KPI tile (big tinted value, icon, detail, optional trailing slot). |
| `KpiCard` | Compact secondary stat card. |
| `MiniBadge` | Tiny rounded badge for header right slots. |
| `Sparkline` | 28px area chart for trend visualisation in tiles. No axes. |

These ship as a barrel export so the main `/dashboard` page and the reports super-dashboard render with identical visual rhythm.

## Sparklines on hero KPIs

The four CEO/Employee hero tiles (OKR scope · Progress · Risk rate · Initiatives) each render a `<Sparkline>` derived from current `planRows` / `departmentRows`. This is **real shape, not synthetic** — when historical snapshots land (Phase 3) the series will swap to true 8-week trends from a `dashboard_snapshots` table.

## Architecture decisions

1. **Explicit `select` over `include`.** Codex moved the page query from `include` to `select` to work around a missing `objectives.confidence` column. Keep this pattern even after the column lands — explicit selects are denser, faster, and document exactly what the dashboard depends on.
2. **One loader, three callers.** `loadDashboardPayload()` is the single source of truth. Page + both API routes use it. No duplicate Prisma queries.
3. **Client-side aggregation.** Heavy aggregation (status counts, plan rollups, recommendations) happens in `ReportDashboardClient` via `useMemo`. The server payload is denormalized rows; aggregation logic stays close to display logic. This keeps the API contract minimal and lets us iterate on widgets without server churn.
4. **CEO live channel deferred.** Phase 1 ships server-rendered + manual refresh only. Pusher channel `dashboard:ceo` is queued for Phase 3.

## Roadmap

### Phase 1 — Structural cleanup (✅ shipped)

- Promote `DashboardCard` / `InsightTile` / `KpiCard` / `MiniBadge` / `Sparkline` to `components/ui/dashboard/`.
- Extract `lib/dashboards/payload.ts` shared loader.
- Add `/api/dashboards/ceo` (gated) and `/api/dashboards/me` routes.
- Hide CEO segment for non-admin/exec.
- Sparklines on the four hero KPI tiles.

### Phase 2 — Employee dashboard upgrade (✅ shipped)

- Today strip (3 cards: due-today, KRs needing check-in, check-in streak)
- My OKR radial gauges per owned KR with "Log check-in" CTA
- Personal velocity sparkline (initiatives completed / week, last 8 weeks)
- My alignment strip (me → parent → … → root)
- Top-5 in-progress kanban preview that opens `TodoCardModal` via `useInitiativeDetailStore`
- 12-week streak heatmap (inline SVG-style grid, no new dep)
- Upcoming agenda (next 14 days, grouped, clickable)
- Recommendations carried over from Codex's recommendation engine

Lives in [`features/reports/components/EmployeeSuperDashboard.tsx`](../features/reports/components/EmployeeSuperDashboard.tsx). The Reports client picks this dashboard when `mode === 'employee'`; CEO mode keeps the original `SuperDashboard`.

### Phase 3 — CEO advanced widgets

- Alignment-tree heatmap (recolour existing alignment map by `goalStatus`)
- True burn-up chart with expected line + variance band (needs a `dashboard_snapshots` table seeded by a daily cron)
- Activity firehose (last 50 system events)
- Quarter-vs-quarter comparison strip
- "Send nudge" CTA on owner workload (calls `emit('CHECKIN_WEEKLY_DUE', …)` for the named owner)
- Pusher live updates on `dashboard:ceo`

### Phase 4 — Quality + observability

- Permission tests (`__tests__/api/dashboards.test.ts` — confirm 403s)
- Loading skeletons via `@/components/ui/Skeleton`
- Empty states via `@/components/ui/EmptyState`
- Error boundary on the client
- Bundle-size budget for the reports route

## Where to look in code

| Concern | File |
|---|---|
| Add a CEO-mode widget | [`components/reports/ReportDashboardClient.tsx`](../components/reports/ReportDashboardClient.tsx) (`SuperDashboard`) |
| Change the data shape | [`lib/dashboards/payload.ts`](../lib/dashboards/payload.ts) (one loader, two callers) |
| Adjust permissions | [`app/api/dashboards/ceo/route.ts`](../app/api/dashboards/ceo/route.ts) + the `canSeeCeoMode` check in `ReportDashboardClient` |
| Reuse hero tiles elsewhere | Import from [`components/ui/dashboard`](../components/ui/dashboard/index.ts) |
