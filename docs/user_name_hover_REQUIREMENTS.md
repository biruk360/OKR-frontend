# Full Name on Hover for Abbreviated People

> Status: **IMPLEMENTED** 2026-09-25. See the matching entry in `docs/CHANGELOG_AI.md`.
> Owner: TBD. Last updated: 2026-09-25.
>
> Legend: **[V]** verified against code in this repo · **[A]** assumption that needs confirmation.
> Every requirement has an ID and Given/When/Then acceptance criteria.

---

## Context

> *"On the sprint board, to-do card, modal etc. and everywhere, if a name is just showing
> abbreviated names it should include full name view when a user hovers over it and it should be nice."*

This covers every place a person is shown only as initials, a photo, a "+N" overflow or a clipped
(`truncate`) name. Hovering those, or focusing them when they are focusable, must show the full name
in a styled hover card. The browser's plain `title` tooltip does not count.

---

## 1. Current implementation **[V]**

- `components/shared/UserAvatar.tsx` (`UserAvatar`, `UserAvatarStack`) only set `title={name}`. The
  "+N" chip put all the hidden names into one `title` string.
- `components/ui/tooltip.tsx` (Radix, shadcn v4 markup) was used only by `ScoringWorkspace`, which
  mounts its own provider. **No app-wide `TooltipProvider`.** Its content classes use Tailwind v4
  syntax (`origin-(--…)`, `data-open:`), which this Tailwind v3 build does not compile, and the
  `tw-animate-css` utilities are v4 `@utility` rules for the same reason.
- About 30 hand-rolled avatar helpers exist (see `design_refresh_IMPLEMENTATION_STRATEGY.md`:
  "avatars are implemented five different ways"). Most rely on `title=` or show nothing on hover.
- The card modal uses `z-[90]/z-[91]` panels, and the mention list is `z-[200]`.

### 1.1 Inventory

| Site | Shows | Full name beside it? | Result |
|---|---|---|---|
| `UserAvatar` / `UserAvatarStack` (shared) | initials/photo, "+N" | no | **Tooltip by default**; "+N" lists names |
| `TaskCardTrello` members stack | stack | no | **Tooltip**, "Assignee"/"Member" |
| `SprintBoardClient` header avatars (buttons) + "+N" | photo/initials | no | **Tooltip on the button** ("You · N cards · Click to filter") |
| `SprintBoardClient` filter option avatar | avatar | yes (label) | skip |
| `TodoCardModal` Members row · checklist-item assignee | initials | no | **Tooltip** |
| `TodoCardModal` member / checklist pickers | name `truncate` | yes | **Tooltip only when clipped** |
| `TodoCardModal` activity, comments, replies | avatar | yes | skip |
| `TodoCard` (Work Board) assignee + members | initials | no | **Tooltip** |
| `todos-page` table / kanban / tree assignee | initials | no | **Tooltip** (tree: focusable button) |
| `features/todos/ToDoList` assignee | avatar + name (120px cap) | yes | name gets tooltip only when clipped |
| `SprintsListClient` participants + "+N", backlog assignee | initials | no | **Tooltip** |
| `MentionEditor` list, `ViewersList`, `AppleAnalytics` contributors | name `truncate` | yes | tooltip only when clipped |
| `okrs-all` / `okr-hierarchy` owner, collaborators + "+N" | initials | owner: yes · collaborators: no | collaborators, "+N" and bare owner get a **tooltip**; owner name only when clipped |
| `objective-detail/ActivityTabs` collaborators | initials | no | **Tooltip** |
| `objective-detail/KRList`, `NestedObjectivesList` owner | avatar + clipped name | yes | tooltip only when clipped, native `title` removed |
| `GoalsTable`, `KeyResultsList` (×2), `RisksPanel` reporter | initials | no | **Tooltip** |
| `ReportDashboardClient` KR/objective owner | initials | no | **Tooltip** |
| `filters` KR modal (todo assignee, check-in author), Objective modal (KR owner) | 1 letter | no | **Tooltip** |
| `org/teams/[id]` KR owner link | photo/letter | no | **Tooltip** |
| `admin-org` OrgChart/Departments member rows, `ProfileOrgMinimap` | name `truncate` | yes | tooltip only when clipped |
| ActivityLogPanel, EvaluationActivityPanel, ObjectiveHero (has its own card), KrInspector/ActivityTabs owner, KeyResultDetail, ObjectivesList, GoalsFeed, MyTeam, admin-org Avatar callers, filters owner rows/chips, ResultsList, LetterPermissions, UserManagement, UserDetail, org users/teams pages, OkrComments, TeamActivityFeed, AppleDashboard feed, Scrum UpdateCard, DTP console/editor, Project capacity view, strategy-map PersonNode, OkrBreadcrumb, Header menu, AssignUserModal, PlansGantt | avatar | **yes** | skip: a hover card would repeat the name beside it |
| Client portal (`app/portal/*`) | — | — | **Excluded** (invariant #4: no employee names) |

## 2. Conflict check against existing specs **[V]**

| Existing requirement | Relationship |
|---|---|
| `trello_parity_sprint_board_REQUIREMENTS.md` **A11Y-2** (focusable cards), **A11Y-5** (aria-labels), **A11Y-6** (reduced motion), **A11Y-7** (focus rings) | Honoured. No new tab stops on the board. Header avatar buttons keep `aria-pressed`, `aria-label` and the focus ring. Motion follows the global reduced-motion block. |
| Same doc **AFL-8** (the header avatar stack toggles the assignee filter) | Unchanged. The tooltip wraps the existing button, and clicking still toggles the filter (the tooltip closes on click). |
| `design_refresh_IMPLEMENTATION_STRATEGY.md`: standardise avatars on `UserAvatar` + `lib/user-color` | Aligned. The hover card lives in `UserAvatar.tsx`. Local helpers whose visuals differ were wrapped rather than swapped (UNH-9). |
| `components/ui/popover.tsx` shadow ramp (`--ap-shadow-pop-*`) | Reused (`--ap-shadow-pop-sm`). |
| Project invariant #4 (portal) | No portal file touched. |

---

## 3. Requirements: `UNH`

| ID | Requirement |
|---|---|
| UNH-1 | One shared implementation, `PersonTooltip` / `PeopleTooltip` in `components/shared/UserAvatar.tsx`, built on Radix Tooltip (`radix-ui`, already installed). One `TooltipProvider` (180ms delay, 300ms skip-delay) is mounted in `app/providers.tsx`. |
| UNH-2 | Every compact person (initials, photo) whose full name is not printed beside it shows the full name on hover. `UserAvatar` does this **by default** (`tooltip` defaults to `true`). |
| UNH-3 | **The card:** a 28px avatar, the full name (13px semibold, `--ap-fg`) and an optional secondary line (`--ap-fg-subtle`) shown **only when the data is already in hand**, for example "Assignee", "Member", "You · 3 cards", "Owner". Styling: `--ap-bg-raised` surface, `--ap-border` hairline, `--ap-shadow-pop-sm`, `--ap-radius-md`, `z-[210]` (above the card modal's 90/91 and the mention list's 200), 180ms ease-apple fade + scale. Dark mode comes from the tokens. |
| UNH-4 | A clipped name (`truncate`) shows the card **only when it is actually clipped** (`scrollWidth > clientWidth`, checked on open, so it costs nothing until then). |
| UNH-5 | In an avatar stack, each avatar shows its own person. The "+N" chip lists the hidden people (avatar + name, up to 8, then "and N more"). |
| UNH-6 | No tooltip where the full name is already visible next to the avatar, so the UI does not repeat itself. |
| UNH-7 | **A11y:** avatars carry `alt`, or `role="img"` + `aria-label`, with the full name, and the initials are `aria-hidden`. The card opens on keyboard focus for triggers that are already focusable. Static avatars **do not** become tab stops. The native `title` is removed wherever the card replaces it, so two tooltips never show together. |
| UNH-8 | **Performance:** each trigger costs one Radix Tooltip root (a context plus a few refs). The content, portal and popper mount only while open, and nothing is fetched. |
| UNH-9 | Local helpers whose visuals differ from `UserAvatar` (the 0.38 initials scale in the card modal and `TodoCard`, accent-filled circles) are **wrapped**, not swapped, so nothing on screen changes except the hover. |

- **UNH-AC-1**: *Given* the sprint board, *when* the pointer rests 180ms on a card's member avatar,
  *then* a card shows that member's full name and "Assignee" or "Member". *When* it moves to the
  next avatar, the next card opens with no delay.
- **UNH-AC-2**: *Given* a stack with "+2", *when* it is hovered, *then* both hidden names are listed.
- **UNH-AC-3**: *Given* the card modal is open, *when* a member avatar is hovered, *then* the card
  renders above the modal and above any open panel.
- **UNH-AC-4**: *Given* keyboard focus on a header avatar button, *then* the card opens. Space still
  toggles the filter, and `aria-pressed` is unchanged.
- **UNH-AC-5**: *Given* a name that fits, *when* it is hovered, *then* nothing appears. *Given* it is
  clipped, *then* the full name appears.
- **UNH-AC-6**: *Given* OS reduced-motion, *then* the card appears and disappears instantly.
- **UNH-AC-7**: *Given* a board of 300 cards, *then* the DOM has no tooltip content or portal nodes
  until one is hovered.

---

## 4. Reuse audit **[V]**

| Need | Reused | New (gap it fills) |
|---|---|---|
| Positioning, delay grouping, focus/hover, collision | Radix Tooltip (`radix-ui`) | Nothing: no new dependency |
| Colour and initials | `lib/user-color` (`userColor`, `userInitials`) | `personDisplayName`, `personDetail`, `overflowPeople` (pure, unit-tested in `lib/sprints/person-tooltip.test.ts`) |
| Surface / shadow / radius | `--ap-bg-raised`, `--ap-border`, `--ap-shadow-pop-sm`, `--ap-radius-md` | `.ap-person-tip` keyframes in `globals.css`. The `tw-animate` classes do not compile on Tailwind v3 |
| Provider | `components/ui/tooltip` `TooltipProvider` | Mounted once in `app/providers.tsx` |

---

## 5. Assumptions

| # | Assumption |
|---|---|
| A1 | **[A]** The secondary line uses only data already on the page (role on the card, "You", card counts). Email/department are not fetched, and the card never adds a request. |
| A2 | **[A]** Touch devices get no hover card (Radix ignores touch pointers). The name remains available to screen readers through `aria-label`. |
| A3 | **[A]** `TodoCard` (Work Board) still shows at most 3 members with no "+N". Adding the overflow chip is a behaviour change and was left out. |
| A4 | The shadcn `TooltipContent` in `components/ui/tooltip.tsx` (used by ScoringWorkspace) keeps its v4 classes. Fixing them is out of scope. |
