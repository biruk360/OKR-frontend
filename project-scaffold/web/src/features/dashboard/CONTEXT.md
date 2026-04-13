# CONTEXT — features/dashboard (web)
> AI reads this instead of scanning the entire dashboard folder.

## Purpose
Post-login home screen. Shows summary metrics, recent activity, and quick navigation to other modules.

## Screens
- `DashboardScreen` — main home with stat cards, activity feed, quick actions
- `NotificationsScreen` — list of user notifications

## Components used (from shared/)
- `StatCard`, `ListItem`, `PageHeader` — layout
- `AppBadge`, `LoadingSpinner`, `EmptyState` — state feedback
- `DataTable` — if showing tabular recent activity

## State
- `useDashboardStore` (`features/dashboard/stores/dashboardStore.ts`) — metrics, recentActivity, notifications
- `useAuthStore` — to display user name/role

## Services
- `DashboardService` (`features/dashboard/services/dashboardService.ts`) — fetchMetrics(), fetchRecentActivity(), fetchNotifications()

## API endpoints
- `GET /dashboard/metrics`
- `GET /dashboard/activity?limit=10`
- `GET /notifications`

## Do NOT import from
- Any other `features/` module
