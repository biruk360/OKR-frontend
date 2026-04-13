# Application Sitemap
> **AI instruction:** When you create any new screen, modal, bottom sheet, or route — append it to the correct module section below.
> Use the exact table format. Never delete existing rows.

Last updated: <!-- AI updates this -->

---

## How to read this file

| Column | Meaning |
|--------|---------|
| Route / ID | URL path (web) or named route (mobile). Modals/sheets get a descriptive ID. |
| Screen name | The component name as exported |
| Type | `Screen` · `Modal` · `BottomSheet` · `SidePanel` · `Tab` |
| Auth | `Yes` = requires login · `No` = public |
| Stack | `web` · `mobile` · `both` |
| Status | Links to FEATURES.md status |

---

## Auth flows — public screens

| Route / ID | Screen Name | Type | Auth | Stack | Status |
|-----------|-------------|------|------|-------|--------|
| `/login` · `auth/login` | LoginScreen | Screen | No | both | ⏳ |
| `/register` · `auth/register` | RegisterScreen | Screen | No | both | ⏳ |
| `/forgot-password` · `auth/forgot` | ForgotPasswordScreen | Screen | No | both | ⏳ |
| `/reset-password` · `auth/reset` | ResetPasswordScreen | Screen | No | both | ⏳ |

## Dashboard

| Route / ID | Screen Name | Type | Auth | Stack | Status |
|-----------|-------------|------|------|-------|--------|
| `/` · `dashboard/home` | DashboardScreen | Screen | Yes | both | ⏳ |
| `/notifications` · `dashboard/notifications` | NotificationsScreen | Screen | Yes | both | ⏳ |

## Shared overlays — appear across all modules

| Route / ID | Screen Name | Type | Triggered from | Stack |
|-----------|-------------|------|---------------|-------|
| `overlay/confirm` | ConfirmDialog | Modal | Any destructive action | both |
| `overlay/filter` | FilterSheet | BottomSheet / SidePanel | Any list screen | both |
| `overlay/date-range` | DateRangePickerSheet | BottomSheet / Modal | Any date filter | both |
| `overlay/image-viewer` | ImageViewerModal | Modal | Any image tap | both |

---
<!-- AI: add new module sections and screen rows above this line.
     Copy this block template for each new module:

## [Module name]

| Route / ID | Screen Name | Type | Auth | Stack | Status |
|-----------|-------------|------|------|-------|--------|
| `/route` · `module/route` | ScreenName | Screen | Yes | both | ⏳ |

-->
