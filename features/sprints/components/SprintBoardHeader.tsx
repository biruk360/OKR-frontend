'use client'

/**
 * Sprint board sticky header (spec §4.3): title + state, sprint actions
 * (schedule / start / complete / report / background / members / share),
 * read-only banner, dates, dual progress bars, and the filter row (BRD-2:
 * assignee / label / due multi-selects, "Watching" toggle, linked segmented
 * control, active-filter badge + Clear filters, board-people avatars). Filter
 * state and matching live in SprintBoardClient + lib/sprints/board-filters;
 * this only renders the controls.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MoreHorizontal, Calendar, Filter, CheckCircle2, ChevronDown, Users, Columns, FileText, UserRound, Tag, CalendarClock, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { personDetail } from '@/lib/user-color'
import type { BoardPerson } from '@/lib/sprints/board-people'
import type { BoardFilterState, DueFilter, LinkedFilter } from '@/lib/sprints/board-filters'
import StatusPill from '@/components/shared/StatusPill'
import { ActionsMenu } from '@/components/ui/ActionsMenu'
import { FilterMultiSelect, type FilterMultiSelectOption } from '@/components/ui/FilterMultiSelect'
import { Progress } from '@/components/ui/progress'
import { PeopleTooltip, PersonTooltip, UserAvatar } from '@/components/shared/UserAvatar'
import CopyLinkButton from '@/components/shared/CopyLinkButton'
import { GenerateSprintButton } from '@/features/sprints-ai'
import type { SprintBackgroundKey } from '@/lib/sprint-backgrounds'
import SprintBackgroundPicker from './SprintBackgroundPicker'
import type { BoardData } from './sprintBoardTypes'

function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  return <Progress value={percent} fill={color ?? 'var(--ap-accent)'} />
}

export type { LinkedFilter }

export interface SprintBoardHeaderProps {
  sprintId: string
  currentUserId: string
  data: BoardData
  dark: boolean
  isClosed: boolean
  daysLeft: number | null
  starting: boolean
  setScheduleMode: (mode: 'edit' | 'start' | null) => void
  handleStartSprintClick: () => void
  setShowEnd: (v: boolean) => void
  setShowMembers: (v: boolean) => void
  /** Opens the board switcher (also reachable from the floating bar). */
  onSwitchBoards: () => void
  invalidate: () => void
  filters: BoardFilterState
  patchFilters: (patch: Partial<BoardFilterState>) => void
  assigneeOptions: FilterMultiSelectOption[]
  labelOptions: FilterMultiSelectOption[]
  dueOptions: FilterMultiSelectOption[]
  filtersActive: number
  clearFilters: () => void
  boardPeople: BoardPerson[]
  toggleAssignee: (id: string) => void
}

export default function SprintBoardHeader({
  sprintId, currentUserId, data, dark, isClosed, daysLeft, starting, setScheduleMode,
  handleStartSprintClick, setShowEnd, setShowMembers, onSwitchBoards, invalidate, filters, patchFilters,
  assigneeOptions, labelOptions, dueOptions, filtersActive, clearFilters, boardPeople, toggleAssignee,
}: SprintBoardHeaderProps) {
  const { sprint, aggregates } = data
  // The owner counted once, whether or not they are also a participant row.
  const memberCount = data.participants.filter((p) => p.id !== sprint.owner.id).length + 1
  const router = useRouter()
  const filterAssignees = filters.assignees
  const filterLinked = filters.linked

  // One look for every filter trigger; an active facet gets the accent ring so
  // the row shows at a glance which facets are narrowing the board.
  const triggerClassName =
    'h-[32px] gap-1.5 rounded-[var(--ap-radius-md)] px-[11px] text-[12.5px] font-semibold shadow-none'
  const triggerStyle = (active: boolean): React.CSSProperties => ({
    borderColor: active ? 'var(--ap-accent)' : dark ? 'oklch(1 0 0 / 0.2)' : 'var(--ap-border-strong)',
    background: active
      ? (dark ? 'oklch(1 0 0 / 0.18)' : 'var(--ap-accent-soft)')
      : (dark ? 'oklch(1 0 0 / 0.1)' : 'var(--ap-bg-raised)'),
    color: dark ? 'oklch(1 0 0)' : active ? 'var(--ap-accent-on-soft)' : 'var(--ap-fg-muted)',
  })
  const facetTrigger = (Icon: typeof Filter, text: string) => (
    <>
      <Icon className="h-[13px] w-[13px] opacity-70" aria-hidden />
      <span className="max-w-[160px] truncate">{text}</span>
      <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
    </>
  )
  return (
    <div
      className={cn(
        'sticky top-0 z-20 -mx-4 border-b px-4 py-3 backdrop-blur-md',
        dark && 'text-white',
      )}
      style={{
        background: dark ? 'oklch(0.22 0.02 262 / 0.62)' : 'color-mix(in oklab, var(--ap-bg-raised) 70%, transparent)',
        borderColor: dark ? 'oklch(1 0 0 / 0.14)' : 'var(--ap-border)',
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/sprints"
          className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          style={{ color: dark ? 'oklch(0.94 0.005 262)' : 'var(--ap-fg-secondary)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Sprints
        </Link>
        <h1 className="text-lg font-semibold leading-tight" style={{ letterSpacing: '-0.01em' }}>{sprint.name}</h1>
        <StatusPill status={sprint.state.toLowerCase().replace('_', '-')} />
        <div className="ml-auto flex items-center gap-2">
          {sprint.state === 'PLANNING' && (
            <>
              <button
                type="button"
                onClick={() => setScheduleMode('edit')}
                className="h-[32px] rounded-[var(--ap-radius-md)] border px-3 text-[12.5px] font-semibold"
                style={{
                  borderColor: dark ? 'oklch(1 0 0 / 0.2)' : 'var(--ap-border-strong)',
                  background: dark ? 'oklch(1 0 0 / 0.1)' : 'var(--ap-bg-raised)',
                  color: dark ? 'oklch(1 0 0)' : 'var(--ap-fg-muted)',
                }}
              >
                {sprint.startDate && sprint.endDate ? 'Edit dates' : 'Schedule'}
              </button>
              {sprint.startDate && sprint.endDate && (
                <GenerateSprintButton sprintId={sprintId} variant="subtle" />
              )}
              <button
                type="button"
                onClick={handleStartSprintClick}
                disabled={starting}
                className="rounded-[var(--ap-radius-sm)] bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {starting ? 'Starting…' : 'Start sprint'}
              </button>
            </>
          )}
          {sprint.state === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => setShowEnd(true)}
              className="rounded-[var(--ap-radius-sm)] px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                border: '0.5px solid var(--ap-accent)',
                color: 'var(--ap-accent)',
                background: 'var(--ap-accent-soft)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--ap-accent)', e.currentTarget.style.color = 'var(--ap-accent-fg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--ap-accent-soft)', e.currentTarget.style.color = 'var(--ap-accent)')}
            >
              Complete sprint
            </button>
          )}
          {isClosed && (
            <Link
              href={`/dashboard/sprints/${sprintId}/report`}
              className="rounded-[var(--ap-radius-sm)] px-3 py-1 text-xs font-semibold"
              style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
            >
              View sprint report
            </Link>
          )}
          {!isClosed && (
            <SprintBackgroundPicker
              sprintId={sprintId}
              current={(sprint.background as SprintBackgroundKey | null) ?? 'none'}
              onChanged={() => invalidate()}
              dark={dark}
            />
          )}
          {/* Invite-only boards (2026-09-25): the link below only opens for
              people on this list, so sharing starts here. */}
          <button
            type="button"
            onClick={() => setShowMembers(true)}
            title="Board members — invite people"
            aria-label={`Board members (${memberCount})`}
            className="inline-flex h-[32px] items-center gap-1.5 rounded-[var(--ap-radius-md)] border px-3 text-[12.5px] font-semibold"
            style={{
              borderColor: dark ? 'oklch(1 0 0 / 0.2)' : 'var(--ap-border-strong)',
              background: dark ? 'oklch(1 0 0 / 0.1)' : 'var(--ap-bg-raised)',
              color: dark ? 'oklch(1 0 0)' : 'var(--ap-fg-muted)',
            }}
          >
            <Users className="h-3.5 w-3.5" />
            Members
            <span className="font-mono tabular-nums opacity-70">{memberCount}</span>
          </button>
          {/* BRD-1 — share the board itself. Like the card link (SHR-3) this is
              an ordinary in-app URL: the recipient still has to sign in and
              pass canViewSprint, so no new access path is created. */}
          <CopyLinkButton
            value={typeof window !== 'undefined' ? `${window.location.origin}/dashboard/sprints/${sprintId}` : ''}
            label="Share"
            copiedLabel="Copied"
            successMessage="Board link copied"
            errorMessage="Could not copy the board link"
            title="Copy a link to this board"
            className="h-[32px] rounded-[var(--ap-radius-md)] border px-3"
          />
          {/* Was an inert button. Now carries the board actions that have no
              other home in the header row. */}
          <ActionsMenu
            label="More board actions"
            align="right"
            className={cn(
              'grid h-[32px] w-[32px] place-items-center rounded-[var(--ap-radius-md)] border',
              dark
                ? 'border-[oklch(1_0_0_/_0.2)] bg-[oklch(1_0_0_/_0.1)] text-[oklch(1_0_0)]'
                : 'border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] text-[var(--ap-fg-secondary)]',
            )}
            trigger={<MoreHorizontal className="h-4 w-4" />}
            items={[
              { key: 'members', label: 'Board members', icon: Users, onSelect: () => setShowMembers(true) },
              { key: 'switch', label: 'Switch boards', icon: Columns, onSelect: onSwitchBoards },
              {
                key: 'report',
                label: 'View sprint report',
                icon: FileText,
                hidden: !isClosed,
                onSelect: () => router.push(`/dashboard/sprints/${sprintId}/report`),
              },
            ]}
          />
        </div>
      </div>

      {/* Read-only banner (FR-04 / UX-05) */}
      {isClosed && (
        <div
          className="mt-3 flex items-center gap-2 rounded-[var(--ap-radius-sm)] px-3 py-2 text-xs"
          style={{
            background: 'var(--ap-bg-sunken)',
            border: '0.5px solid var(--ap-border)',
            color: 'var(--ap-fg-muted)',
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--ap-green)' }} />
          <span>
            Sprint {sprint.state === 'COMPLETED' ? 'completed' : 'cancelled'}
            {sprint.endedAt && <> on {new Date(sprint.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>}
            {' '}· read-only
          </span>
        </div>
      )}

      <div
        className="mt-2 flex items-center gap-3 text-caption"
        style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-subtle)' }}
      >
        {sprint.startDate && sprint.endDate && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' → '}
            {new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {daysLeft !== null && <span>{daysLeft} days remaining</span>}
      </div>

      {/* Dual progress bars */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between text-caption">
            <span className="font-semibold">Tasks</span>
            <span
              className="font-mono tabular-nums"
              style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-subtle)' }}
            >
              {aggregates.taskDone}/{aggregates.taskTotal} done · {aggregates.taskPercent}%
            </span>
          </div>
          <div className="mt-1"><ProgressBar percent={aggregates.taskPercent} color="var(--ap-green)" /></div>
        </div>
        {sprint.goalTarget != null && sprint.goalTarget > 0 && (
          <div>
            <div className="flex items-center justify-between text-caption">
              <span className="font-semibold">{sprint.goalLabel ?? 'Goal'}</span>
              <span
                className="font-mono tabular-nums"
                style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-subtle)' }}
              >
                {sprint.goalUnit ? `${sprint.goalUnit} ` : ''}{(sprint.goalCurrent ?? 0).toLocaleString()} / {sprint.goalTarget.toLocaleString()} · {aggregates.goalPercent ?? 0}%
              </span>
            </div>
            <div className="mt-1"><ProgressBar percent={aggregates.goalPercent ?? 0} color="var(--ap-accent)" /></div>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* BRD-2 — active-filter count. Not a control: the facets beside it
            are; this summarises how many of them are narrowing the board. */}
        <span
          className="inline-flex h-[32px] items-center gap-1.5 text-[12.5px] font-semibold"
          style={{ color: dark ? 'oklch(0.94 0.005 262)' : 'var(--ap-fg-secondary)' }}
          aria-live="polite"
        >
          <Filter className="h-[13px] w-[13px] opacity-60" aria-hidden />
          <span className="sr-only">
            {filtersActive === 0 ? 'No filters active' : `${filtersActive} filter${filtersActive === 1 ? '' : 's'} active`}
          </span>
          <span aria-hidden>Filters</span>
          {filtersActive > 0 && (
            <span
              className="rounded-full px-1.5 text-micro font-bold leading-[16px]"
              style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
              aria-hidden
            >
              {filtersActive}
            </span>
          )}
        </span>

        {/* AFL-3/5/9 — assignee filter: multi-select over the board's people. */}
        <FilterMultiSelect
          label="Assignee"
          ariaLabel="Filter cards by assignee"
          values={filterAssignees}
          onValuesChange={(assignees) => patchFilters({ assignees })}
          options={assigneeOptions}
          placeholder="All assignees"
          summary={(sel) => `${sel.length} assignees`}
          emptyLabel="No people match"
          clearLabel="Clear assignees"
          menuWidth={280}
          triggerClassName={triggerClassName}
          triggerStyle={triggerStyle(filterAssignees.length > 0)}
          renderTrigger={({ text }) => facetTrigger(UserRound, text)}
        />

        {/* BRD-2 — label facet: any selected label (or "No label"). */}
        <FilterMultiSelect
          label="Label"
          ariaLabel="Filter cards by label"
          values={filters.labels}
          onValuesChange={(labels) => patchFilters({ labels })}
          options={labelOptions}
          placeholder="All labels"
          summary={(sel) => `${sel.length} labels`}
          emptyLabel="No labels match"
          clearLabel="Clear labels"
          menuWidth={260}
          triggerClassName={triggerClassName}
          triggerStyle={triggerStyle(filters.labels.length > 0)}
          renderTrigger={({ text }) => facetTrigger(Tag, text)}
        />

        {/* BRD-2 — due facet: overdue / today / this week / no date (any of). */}
        <FilterMultiSelect
          label="Due"
          ariaLabel="Filter cards by due date"
          values={filters.due}
          onValuesChange={(due) => patchFilters({ due: due as DueFilter[] })}
          options={dueOptions}
          placeholder="Any due date"
          summary={(sel) => `${sel.length} due ranges`}
          clearLabel="Clear due dates"
          menuWidth={220}
          triggerClassName={triggerClassName}
          triggerStyle={triggerStyle(filters.due.length > 0)}
          renderTrigger={({ text }) => facetTrigger(CalendarClock, text)}
        />

        {/* BRD-2 — "Cards I'm watching" toggle. */}
        <button
          type="button"
          onClick={() => patchFilters({ watching: !filters.watching })}
          aria-pressed={filters.watching}
          title="Show only cards you are watching"
          className={cn(
            'inline-flex items-center border ap-focus-ring outline-none transition-colors',
            triggerClassName,
          )}
          style={triggerStyle(filters.watching)}
        >
          <Eye className="h-[13px] w-[13px] opacity-70" aria-hidden />
          Watching
        </button>

        {/* Segmented control (§4.1): 3px track, 2px gap, 26px pills. */}
        <div
          role="group"
          aria-label="OKR link"
          className="flex items-center gap-[2px] rounded-[var(--ap-radius-md)] p-[3px]"
          style={{ background: dark ? 'oklch(1 0 0 / 0.14)' : 'var(--ap-bg-sunken)' }}
        >
          {(['all', 'linked', 'unlinked'] as const).map((f) => {
            const active = filterLinked === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => patchFilters({ linked: f })}
                aria-pressed={active}
                className="h-[26px] rounded-[var(--ap-radius-sm)] px-[11px] text-[12.5px] font-semibold capitalize outline-none ap-focus-ring transition-colors"
                style={
                  active
                    ? { background: 'var(--ap-bg-raised)', color: 'var(--ap-fg)' }
                    : { background: 'transparent', color: dark ? 'oklch(0.94 0.005 262)' : 'var(--ap-fg-secondary)' }
                }
              >
                {f}
              </button>
            )
          })}
        </div>
        {filtersActive > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-[var(--ap-radius-xs)] text-xs font-semibold underline-offset-2 outline-none ap-focus-ring hover:underline"
            style={{ color: 'var(--ap-accent)' }}
          >
            Clear filters
          </button>
        )}
        {/* AFL-8 — the same board people; each avatar toggles that person in
            the assignee filter. */}
        <div className="ml-auto flex -space-x-1" role="group" aria-label="Board members">
          {boardPeople.slice(0, 5).map((u) => {
            const pressed = filterAssignees.includes(u.id)
            // UNH-2 — the hover card sits on the button (the avatar inside is
            // pointer-events-none), so hover and keyboard focus both open it
            // and it coexists with aria-pressed / the filter toggle.
            return (
              <PersonTooltip
                key={u.id}
                person={u}
                side="bottom"
                detail={personDetail([
                  u.id === currentUserId && 'You',
                  `${u.cardCount} card${u.cardCount === 1 ? '' : 's'}`,
                  pressed ? 'Filtering — click to clear' : 'Click to filter',
                ])}
              >
              <button
                type="button"
                onClick={() => toggleAssignee(u.id)}
                aria-pressed={pressed}
                aria-label={`Filter by ${u.name}`}
                className={cn(
                  'relative inline-flex rounded-full transition-shadow',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ap-focus)]',
                  pressed && 'z-10',
                )}
                style={{
                  // Separator ring in the header's own colour; accent when selected.
                  boxShadow: pressed
                    ? '0 0 0 2px var(--ap-accent)'
                    : `0 0 0 2px ${dark ? 'oklch(0.22 0.02 262)' : 'var(--ap-bg-raised)'}`,
                }}
              >
                <UserAvatar user={u} size={22} className="pointer-events-none" tooltip={false} />
              </button>
              </PersonTooltip>
            )
          })}
          {boardPeople.length > 5 && (
            <PeopleTooltip people={boardPeople.slice(5)} side="bottom">
              <span
                role="img"
                aria-label={`${boardPeople.length - 5} more: ${boardPeople.slice(5).map((u) => u.name).join(', ')}`}
                // Explicit ink: on a dark board background the header text is white,
                // and an inherited colour turned this chip into a blank circle.
                className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--ap-bg-sunken)] text-micro font-semibold text-[var(--ap-fg)]"
              >
                +{boardPeople.length - 5}
              </span>
            </PeopleTooltip>
          )}
        </div>
      </div>
    </div>
  )
}
