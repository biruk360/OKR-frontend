# CONTEXT — features/dashboard (mobile)
> AI reads this instead of scanning the entire dashboard folder.

## Purpose
Post-login home screen. Shows summary metrics, recent activity feed, and quick-action shortcuts to other modules.

## Screens
- `DashboardScreen` — home with stat cards, activity feed, quick actions
- `NotificationsScreen` — paginated notifications list

## Widgets used (from shared/components/)
- `StatCard`, `ListItem`, `PageHeader` — layout building blocks
- `AppBadge`, `LoadingSpinner`, `EmptyState` — state feedback
- `AppButton` — quick-action buttons

## State (Riverpod)
- `dashboardProvider` (`features/dashboard/providers/dashboard_provider.dart`)
  - metrics: `DashboardMetrics`
  - recentActivity: `List<ActivityItem>`
  - isLoading: `bool`
- `notificationsProvider` — paginated notifications
- `authProvider` (shared) — used to display user name

## Services
- `DashboardService` (`features/dashboard/services/dashboard_service.dart`)
  - `fetchMetrics()` → `DashboardMetrics`
  - `fetchActivity({int limit})` → `List<ActivityItem>`
  - `fetchNotifications({int page})` → `PaginatedResult<Notification>`

## API endpoints
- `GET /dashboard/metrics`
- `GET /dashboard/activity?limit=10`
- `GET /notifications?page=N`

## Do NOT import from
- Any other `features/` module
