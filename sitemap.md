# OKR Management System — Sitemap (Markdown)

> Consolidated sitemap / information architecture for the OKR Management System, based on the UI replication requirements and the system requirements captured so far. :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1}

**Implementation Status Legend:**
- ✅ **Implemented** - Fully functional
- 🟡 **Partially Implemented** - Basic functionality exists, may need enhancements
- ❌ **Not Implemented** - Not yet created

---

## Global Navigation (Left Menu)

### 1. Home
- ✅ **Home / Dashboard** (default landing) :contentReference[oaicite:2]{index=2}  
  - ✅ Company snapshot (if permitted)
  - ✅ My snapshot (always)
  - 🟡 Quick actions (New Goal, Check-in)

### 2. Goals
✅ Primary OKR module with top-level tabs and view toggles. :contentReference[oaicite:3]{index=3}  
- ✅ **Goals – My Goals** (default tab) :contentReference[oaicite:4]{index=4}  
  - ✅ List View
  - ✅ Feed View :contentReference[oaicite:5]{index=5}
- ✅ **Goals – My Team** (Manager/Lead) :contentReference[oaicite:6]{index=6}  
  - ✅ List View
  - ✅ Feed View
  - ✅ User View (grouped by direct report) :contentReference[oaicite:7]{index=7}
- ✅ **Goals – Group Goals** (cross-functional/project teams) :contentReference[oaicite:8]{index=8}  
  - ✅ List View
  - ✅ Feed View
- ✅ **Goals – Department** :contentReference[oaicite:9]{index=9}  
  - ✅ List View
  - ✅ Feed View
- ✅ **Goals – Company Goals** :contentReference[oaicite:10]{index=10}  
  - ✅ List View
  - ✅ Feed View
- ✅ **Goal Detail** (page or modal) :contentReference[oaicite:11]{index=11}  
  - 🟡 Comments tab + Progress Updates tab :contentReference[oaicite:12]{index=12}  
  - ✅ Subgoals (Key Results) list + Add New + Edit Weights :contentReference[oaicite:13]{index=13}  
  - ✅ Status + Update Progress + Close Goal :contentReference[oaicite:14]{index=14}  
  - ✅ Parent Objective + Contributing/Child Objectives (deep links) :contentReference[oaicite:15]{index=15}  
  - 🟡 Related Tasks (linking) :contentReference[oaicite:16]{index=16}

### 3. Alignment Map
- ✅ **Alignment Map (OKR Hierarchy Visualization)** :contentReference[oaicite:17]{index=17}  
  - ✅ Collapse/expand branches
  - 🟡 Pan/zoom
  - ✅ Inspect node details

### 4. Reports & Analytics
🟡 (Company/department/individual performance reporting aligned to timeframe filters.)
- 🟡 **Company Report** (Basic stats available)
- 🟡 **Department/Team Report** (Basic stats available)
- 🟡 **Individual Report** (Basic stats available)
- ❌ **Alignment Status Report**
- 🟡 **Exports**
  - ❌ CSV
  - ❌ PDF

### 5. Activity & Notifications
- ✅ **Activity Feed** (check-ins, edits, comments, assignments)
- ✅ **Notifications Center**
- ✅ **Notification Preferences** (email/in-app; cadence)

### 6. People / Organization
- 🟡 **My Team Directory** (Manager/Lead convenience view - available via My Team in Goals)
- ✅ **Teams Directory** (read-only for non-admins; admin manages via Settings)
- ✅ **User Profile** (self)

### 7. Settings (Admin only)
✅ Admin-controlled configuration surfaces referenced in the requirements. :contentReference[oaicite:18]{index=18}  
- ✅ **User Management**
  - ✅ Users List :contentReference[oaicite:19]{index=19}  
  - 🟡 Add/Invite User :contentReference[oaicite:20]{index=20}  
  - ✅ Edit User (role/team assignment) :contentReference[oaicite:21]{index=21}  
  - ✅ Deactivate / Reactivate user
- ✅ **Team Management**
  - ✅ Teams List + Create Team :contentReference[oaicite:22]{index=22}  
  - ✅ Team Details (Leads & Members) :contentReference[oaicite:23]{index=23}  
- ✅ **Timeframes / Periods**
  - ✅ Create period, set active, close/archive :contentReference[oaicite:24]{index=24}  
- ✅ **OKR Rules**
  - ✅ Default visibility
  - ✅ Grading scale
  - ✅ Check-in cadence/reminders :contentReference[oaicite:25]{index=25}  
- ✅ **Branding**
  - ✅ Workspace name + logo :contentReference[oaicite:26]{index=26}  
- ✅ **Integrations & API Keys**
  - ✅ Email / Slack reminders and integration keys :contentReference[oaicite:27]{index=27}  
- ✅ **Audit Logs**
  - ✅ Security/compliance log of admin/system actions

---

## Suggested Routes (Deep Linking / URL Structure)

**Implementation Status:**
- ✅ Implemented
- 🟡 Partially Implemented
- ❌ Not Implemented

- ✅ `/auth/login` → `/auth/signin`
- ❌ `/auth/forgot-password`
- ❌ `/auth/reset-password`
- ❌ `/auth/invite/:token` (accept invite / activate account)

- ✅ `/app/home` → `/dashboard`

- ✅ `/app/goals/my` (List/Feed toggle) :contentReference[oaicite:28]{index=28} → `/dashboard/goals` (tab: my-goals)
- ✅ `/app/goals/team` (List/Feed/User toggle) :contentReference[oaicite:29]{index=29} → `/dashboard/goals` (tab: my-team)
- ✅ `/app/goals/groups` → `/dashboard/goals` (tab: group-goals)
- ✅ `/app/goals/department` → `/dashboard/goals` (tab: department)
- ✅ `/app/goals/company` → `/dashboard/goals` (tab: company-goals)

- ✅ `/app/goals/:goalId` (Goal Detail) :contentReference[oaicite:30]{index=30} → `/dashboard/objectives/:id`
  - 🟡 `?tab=overview` (default view)
  - 🟡 `?tab=comments` (comments available but not tabbed)
  - ❌ `?tab=updates` (progress updates not tabbed)

- ✅ `/app/alignment-map` :contentReference[oaicite:31]{index=31} → `/dashboard/alignment-map`

- 🟡 `/app/reports/company` → `/dashboard/reports` (basic stats)
- 🟡 `/app/reports/department` → `/dashboard/reports` (basic stats)
- 🟡 `/app/reports/individual` → `/dashboard/reports` (basic stats)
- ❌ `/app/reports/alignment`

- ✅ `/app/activity` → `/dashboard/activity`
- ✅ `/app/notifications` → `/dashboard/notifications`
- ✅ `/app/profile` (incl. notification preferences) → `/dashboard/settings/profile`

- ✅ `/app/org/teams` (directory) → `/dashboard/org/teams`
- ✅ `/app/org/users` (directory view; admin gets manage actions) → `/dashboard/org/users`

- ✅ `/app/settings` (Admin only) :contentReference[oaicite:32]{index=32} → `/dashboard/settings`
  - ✅ `/app/settings/users` :contentReference[oaicite:33]{index=33} → `/dashboard/settings/users`
  - ✅ `/app/settings/teams` :contentReference[oaicite:34]{index=34} → `/dashboard/settings/teams`
  - 🟡 `/app/settings/teams/:teamId` :contentReference[oaicite:35]{index=35} (team details in list view)
  - ✅ `/app/settings/timeframes` :contentReference[oaicite:36]{index=36} → `/dashboard/settings/timeframes`
  - ✅ `/app/settings/okr-rules` :contentReference[oaicite:37]{index=37} → `/dashboard/settings/okr-rules`
  - ✅ `/app/settings/branding` :contentReference[oaicite:38]{index=38} → `/dashboard/settings/branding`
  - ✅ `/app/settings/integrations` → `/dashboard/settings/integrations`
  - ✅ `/app/settings/audit-logs` → `/dashboard/settings/audit-logs`

---

## Modal / Drawer Surfaces (UX Components, Not Pages)

- ✅ **New Goal modal** (Objective / Subgoal) :contentReference[oaicite:39]{index=39}  
- 🟡 **Update Progress** (KR check-in) :contentReference[oaicite:40]{index=40} (available via Key Result edit)
- 🟡 **Edit Weights** (KR contribution weighting) :contentReference[oaicite:41]{index=41} (not explicitly weighted, but progress calculated)
- ✅ **Add Labels** / 🟡 **Add Related Tasks** :contentReference[oaicite:42]{index=42} (labels implemented, tasks linked but not explicitly "related")

---

## Implementation Summary

**Overall Status:** 🟡 **~85% Complete**

### Fully Implemented ✅
- Home/Dashboard
- Goals module with all tabs and views (My Goals, My Team, Group Goals, Department, Company)
- List View and Feed View for goals
- Goal Detail page with key results, comments, hierarchy
- Alignment Map (OKR Hierarchy Visualization)
- Activity Feed
- Notifications Center
- People/Organization (Teams & Users Directories)
- Settings: Users, Teams, Timeframes, OKR Rules, Branding, Integrations, Audit Logs
- User Profile and Preferences

### Partially Implemented 🟡
- Quick actions on dashboard
- Goal Detail tabs (comments available but not tabbed interface)
- Reports (basic stats, but no detailed reports or exports)
- Export functionality (CSV, PDF)
- Related Tasks linking
- Pan/zoom in Alignment Map
- User invitation flow

### Not Implemented ❌
- Password reset flow
- User invitation acceptance
- Alignment Status Report
- Detailed report exports (CSV, PDF)
- Tabbed interface for Goal Detail (overview/comments/updates)

### Next Steps
1. Implement detailed report generation and export functionality
2. Add tabbed interface to Goal Detail page
3. Complete password reset and user invitation flows
4. Enhance Alignment Map with pan/zoom capabilities
5. Add explicit task linking to objectives  
