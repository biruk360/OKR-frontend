'use client'

/**
 * Card modal header: the linked-OKR breadcrumb and the hero row (complete
 * toggle, editable title, metadata line with card number, lane chip / status
 * pill and "added … by …"). Split out of TodoCardModal.tsx; behaviour unchanged.
 */

import type { RefObject } from 'react'
import { Check, ChevronDown, Target } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ActionsMenu } from '@/components/ui/ActionsMenu'
import { announce } from '@/components/shared/LiveAnnouncer'
import { StatusPill } from './CardModalBits'
import type { CardLane, CardPatch, TodoCardData } from './cardModalTypes'

export interface CardHeaderProps {
  todo: TodoCardData
  sprintClosed: boolean
  patch: CardPatch
  editingTitle: boolean
  setEditingTitle: (v: boolean) => void
  titleDraft: string
  setTitleDraft: (v: string) => void
  saveTitle: () => void
  titleRef: RefObject<HTMLTextAreaElement>
  lanes: CardLane[]
  lanesLoaded: boolean
  currentLane: CardLane | null
  moveToLane: (columnId: string) => void
}

export function CardHeader({
  todo, sprintClosed, patch, editingTitle, setEditingTitle, titleDraft, setTitleDraft,
  saveTitle, titleRef, lanes, lanesLoaded, currentLane, moveToLane,
}: CardHeaderProps) {
  return (
    <>
      {/* ── Breadcrumb (linked OKR) ── */}
      {(todo.keyResult || todo.objective) && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--ap-fg-muted)] min-w-0">
          <Target className="h-3.5 w-3.5 shrink-0 text-[var(--ap-accent)]" />
          <a
            href={`/dashboard/objectives/${todo.keyResult?.objective?.id ?? todo.objective?.id}`}
            className="truncate hover:text-[var(--ap-accent)] transition-colors"
          >
            {todo.keyResult?.objective?.title ?? todo.objective?.title}
          </a>
          {todo.keyResult && (
            <>
              <span className="text-[var(--ap-fg-faint)]">›</span>
              <a
                href={`/dashboard/key-results/${todo.keyResult.id}`}
                className="truncate hover:text-[var(--ap-accent)] transition-colors"
              >
                {todo.keyResult.title}
              </a>
            </>
          )}
        </div>
      )}

      {/* ── Hero: complete toggle · title · metadata line ── */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => {
            const next = todo.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
            patch({ status: next })
            announce(next === 'COMPLETED' ? 'Card marked complete' : 'Card reopened')
          }}
          disabled={sprintClosed}
          aria-label={todo.status === 'COMPLETED' ? 'Mark as not complete' : 'Mark complete'}
          aria-pressed={todo.status === 'COMPLETED'}
          title={todo.status === 'COMPLETED' ? 'Completed — click to reopen' : 'Mark complete'}
          className={cn(
            'mt-[3px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            todo.status === 'COMPLETED'
              ? 'border-[var(--ap-ok)] bg-[var(--ap-ok)] text-white'
              : 'border-[1.5px] border-[var(--ap-border-strong)] bg-transparent text-[var(--ap-ok)] hover:border-[var(--ap-ok)] hover:bg-[var(--ap-ok-bg)]',
          )}
        >
          <Check
            className={cn('h-[15px] w-[15px]', todo.status !== 'COMPLETED' && 'opacity-35')}
            strokeWidth={3.2}
          />
        </button>

        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <textarea
              ref={titleRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle() } if (e.key === 'Escape') setEditingTitle(false) }}
              rows={2}
              className="w-full resize-none rounded-[var(--ap-radius-sm)] border-2 border-[var(--ap-focus)] bg-[var(--ap-bg-raised)] px-2 py-1 text-[23px] font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--ap-fg)] outline-none"
              autoFocus
            />
          ) : (
            <h2
              className="-mx-2 cursor-text rounded-[var(--ap-radius-sm)] px-2 py-1 text-[23px] font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]"
              onClick={() => setEditingTitle(true)}
            >
              {todo.title}
            </h2>
          )}

          {/* Metadata line. No card-ID chip: `Todo` has no such field and
              A plain sequence, not a prefixed code: a prefix would be
              frozen at creation, so a card that later moved sprints
              would carry the wrong letters forever. */}
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-[12.5px] text-[var(--ap-fg-subtle)]">
            {todo.cardNumber != null && (
              <span
                className="rounded-[4px] bg-[var(--ap-bg-sunken)] px-1.5 py-[3px] font-mono text-caption tracking-[0.02em] text-[var(--ap-fg-subtle)]"
                title="Card reference"
              >
                #{todo.cardNumber}
              </span>
            )}
            {lanes.length > 0 && !sprintClosed && (
              <>
                <span>in list</span>
                <ActionsMenu
                  label={`Move card. Currently in ${currentLane?.name ?? 'no list'}`}
                  align="left"
                  className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2 text-[12.5px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
                  trigger={
                    <>
                      <span>{currentLane?.name ?? 'No list'}</span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </>
                  }
                  items={lanes.map((l) => ({
                    key: l.id,
                    label: l.name,
                    disabled: l.id === todo.columnId,
                    onSelect: () => moveToLane(l.id),
                  }))}
                />
              </>
            )}
            {/* One status control, not two. With lanes present the list chip
                IS the status control — a lane carries its statusKey, so moving
                lists sets status and setting status moves the card. Rendering
                both showed "To Do" twice and let them disagree. Without lanes
                (todos page, work board) the pill is the only way to set it. */}
            {lanesLoaded && lanes.length === 0 && (
              <StatusPill status={todo.status} onChange={(v) => patch({ status: v })} />
            )}
            {todo.createdAt && (
              <>
                <span className="opacity-50">·</span>
                <span>added {format(new Date(todo.createdAt), 'MMM d')} by {todo.creator.name}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
