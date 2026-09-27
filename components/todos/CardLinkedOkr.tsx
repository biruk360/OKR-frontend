'use client'

/**
 * "Linked OKR" card inside the card modal — shows the linked objective / key
 * result or invites one, with an inline search picker. Split out of
 * TodoCardModal.tsx; behaviour unchanged.
 */

import { X, Link2, Target, Search, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { OkrLinkResults, TodoCardData } from './cardModalTypes'

export interface LinkedOkrCardProps {
  todo: TodoCardData
  isOpen: boolean
  onToggle: () => void
  onUnlink: () => void
  query: string
  onQueryChange: (v: string) => void
  results: OkrLinkResults
  loading: boolean
  onPickKr: (id: string) => void
  onPickObjective: (id: string) => void
}

export function LinkedOkrCard(p: LinkedOkrCardProps) {
  const linked = p.todo.keyResult || p.todo.objective
  return (
    <div className={cn(
      'overflow-hidden rounded-[var(--ap-radius-card)] bg-[var(--ap-bg-sunken)]',
      linked ? 'border border-[var(--ap-border)]' : 'border border-dashed border-[var(--ap-border-strong)]',
    )}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]">
          <Target className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <Eyebrow size="md" mono className="text-[var(--ap-fg-subtle)]">Linked OKR</Eyebrow>
          {linked ? (
            <div className="mt-0.5 min-w-0">
              <p className="truncate text-body-sm font-semibold text-[var(--ap-fg)]">
                {p.todo.keyResult?.title ?? p.todo.objective?.title}
              </p>
              {p.todo.keyResult && (
                <p className="truncate text-caption text-[var(--ap-fg-muted)]">
                  in {p.todo.keyResult.objective?.title}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--ap-fg-subtle)]">Not linked — pick an objective or key result so progress rolls up.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {linked && (
            <a
              href={p.todo.keyResult ? `/dashboard/key-results/${p.todo.keyResult.id}` : `/dashboard/objectives/${p.todo.objective?.id}`}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-caption font-semibold text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          )}
          <button
            onClick={p.onToggle}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-caption font-semibold text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
          >
            <Link2 className="h-3 w-3" /> {linked ? 'Change' : 'Link'}
          </button>
        </div>
      </div>
      {p.isOpen && (
        <div className="border-t border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ap-fg-faint)]" />
            <input
              autoFocus
              value={p.query}
              onChange={(e) => p.onQueryChange(e.target.value)}
              placeholder="Search objectives & key results…"
              className="w-full rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] pl-9 pr-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:border-transparent"
            />
          </div>
          {linked && (
            <button
              onClick={p.onUnlink}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold text-[var(--ap-danger)] hover:bg-[var(--ap-danger-bg)] transition-colors"
            >
              <X className="h-3 w-3" /> Remove current link
            </button>
          )}
          <div className="max-h-[260px] overflow-y-auto space-y-3">
            {p.loading && <p className="px-2 py-1 text-xs text-[var(--ap-fg-subtle)]">Searching…</p>}
            {!p.loading && p.query.trim() && p.results.objectives.length === 0 && p.results.keyResults.length === 0 && (
              <p className="px-2 py-2 text-xs text-[var(--ap-fg-subtle)]">No matches. Try a shorter keyword.</p>
            )}
            {p.results.keyResults.length > 0 && (
              <div>
                <Eyebrow size="md" mono className="px-2 pb-1 text-[var(--ap-fg-subtle)]">Key results</Eyebrow>
                <div className="space-y-1">
                  {p.results.keyResults.map((kr) => (
                    <button
                      key={kr.id}
                      onClick={() => p.onPickKr(kr.id)}
                      className="flex w-full items-center gap-3 rounded-[var(--ap-radius-sm)] px-2 py-2 text-left hover:bg-[var(--ap-bg-hover)] transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ap-radius-xs)] bg-[var(--ap-accent-soft)] text-[var(--ap-accent)] text-caption font-bold">KR</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[var(--ap-fg)]">{kr.title}</p>
                        <p className="truncate text-caption text-[var(--ap-fg-subtle)]">{kr.objective.title} · {Math.round(kr.progress ?? 0)}%</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {p.results.objectives.length > 0 && (
              <div>
                <Eyebrow size="md" mono className="px-2 pb-1 text-[var(--ap-fg-subtle)]">Objectives</Eyebrow>
                <div className="space-y-1">
                  {p.results.objectives.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => p.onPickObjective(o.id)}
                      className="flex w-full items-center gap-3 rounded-[var(--ap-radius-sm)] px-2 py-2 text-left hover:bg-[var(--ap-bg-hover)] transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ap-radius-xs)] bg-[var(--ap-ahead-bg)] text-[var(--ap-ahead-fg)] text-caption font-bold">O</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[var(--ap-fg)]">{o.title}</p>
                        <p className="truncate text-caption text-[var(--ap-fg-subtle)]">{o.level} · {Math.round(o.progress ?? 0)}%</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
