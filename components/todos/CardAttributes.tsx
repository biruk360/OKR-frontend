'use client'

/**
 * Card modal attribute grid — members, labels, due date, priority. Members,
 * Labels and Dates open their popover at this (grid) anchor; the rail has a
 * second trigger for each (see CardRail). Split out of TodoCardModal.tsx;
 * behaviour unchanged.
 */

import type { ReactNode } from 'react'
import { Plus, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { swatchStyle, readableInk } from '@/lib/card-visuals'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Avatar, DueDateBadge, PriorityPill } from './CardModalBits'
import type { CardPanel, CardPatch, TodoCardData } from './cardModalTypes'

export interface CardAttributesProps {
  todo: TodoCardData
  patch: CardPatch
  colorBlind: boolean
  activePanel: CardPanel
  panelAnchor: 'grid' | 'rail'
  togglePanel: (panel: CardPanel, anchor: 'grid' | 'rail') => (open: boolean) => void
  membersPicker: ReactNode
  labelsPanel: ReactNode
  datesPanel: ReactNode
}

export function CardAttributes({
  todo, patch, colorBlind, activePanel, panelAnchor, togglePanel, membersPicker, labelsPanel, datesPanel,
}: CardAttributesProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(192px,1fr))] gap-x-5 gap-y-4">
      {/* Members */}
      <div>
        <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Members</Eyebrow>
        <div className="relative flex items-center">
          <div className="flex -space-x-1.5">
            {todo.members.map((m) => (
              <Avatar key={m.user.id} id={m.user.id} name={m.user.name} avatar={m.user.avatar} size={28} tooltip detail={m.user.id === todo.assignee?.id ? 'Assignee' : 'Member'} />
            ))}
          </div>
          <Popover
            open={activePanel === 'members' && panelAnchor === 'grid'}
            onOpenChange={togglePanel('members', 'grid')}
          >
            <PopoverTrigger asChild>
              <button
                className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[var(--ap-border-strong)] text-[var(--ap-fg-muted)] transition-colors hover:border-[var(--ap-accent)] hover:text-[var(--ap-accent)]"
                title="Add member"
                aria-label="Add member"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent label="Card members" heading="Card members" width={272} align="start">
              {membersPicker}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Labels — spans two tracks, as in the design */}
      <div className="md:col-span-2">
        <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Labels</Eyebrow>
        <div className="relative flex flex-wrap items-center gap-1.5">
          {todo.labels.map((l) => (
            <span
              key={l.labelDef.id}
              className="inline-flex h-[26px] items-center rounded-[var(--ap-radius-xs)] px-2.5 text-xs font-semibold"
              style={{
                ...swatchStyle(l.labelDef.color, {
                  colorBlind,
                  pattern: (l.labelDef as { pattern?: string | null }).pattern,
                  ink: 'rgba(255,255,255,0.5)',
                }),
                // Yellow and lime are unreadable under white text.
                color: readableInk(l.labelDef.color),
              }}
            >
              {l.labelDef.name}
            </span>
          ))}
          <Popover
            open={activePanel === 'labels' && panelAnchor === 'grid'}
            onOpenChange={togglePanel('labels', 'grid')}
          >
            <PopoverTrigger asChild>
              <button
                className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[var(--ap-radius-xs)] border border-dashed border-[var(--ap-border-strong)] text-[var(--ap-fg-muted)] transition-colors hover:border-[var(--ap-accent)] hover:text-[var(--ap-accent)]"
                title="Add labels"
                aria-label="Add labels"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent label="Labels" heading="Labels" width={276} align="start">
              <div className="max-h-[420px] overflow-y-auto">{labelsPanel}</div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Due date */}
      <div>
        <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Due date</Eyebrow>
        <div className="relative inline-block">
          <Popover
            open={activePanel === 'dates' && panelAnchor === 'grid'}
            onOpenChange={togglePanel('dates', 'grid')}
          >
            <PopoverTrigger asChild>
              <button
                className={cn(
              'inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--ap-radius-xs)] text-[12.5px] font-semibold transition-colors',
              // With a date set the badge brings its own chrome and padding.
              todo.dueDate
                ? 'hover:opacity-80'
                : 'border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2.5 text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]',
            )}
                aria-label={todo.dueDate ? 'Change dates' : 'Add due date'}
              >
                {todo.dueDate
                  ? <DueDateBadge dueDate={todo.dueDate} endTime={todo.endTime} />
                  : <><Calendar className="h-3.5 w-3.5" /> Add due date</>}
              </button>
            </PopoverTrigger>
            <PopoverContent label="Dates" heading="Dates" width={340} align="start">
              {datesPanel}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Priority — existing PriorityPill semantics, moved into the grid */}
      <div>
        <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Priority</Eyebrow>
        <PriorityPill priority={todo.priority} onChange={(v) => patch({ priority: v })} />
      </div>
    </div>
  )
}
