'use client'

/** OKR Explorer — list chrome: bulk action bar, sortable column header row, pagination footer. */

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SortKey, SortState } from './okrs-all-utils'

/* --------------------------- Bulk action bar --------------------------- */

export function BulkActionBar({
  count, busy, onClear, onArchive, onRestore,
}: {
  count: number
  busy: null | { done: number; total: number }
  onClear: () => void
  onArchive: () => void
  onRestore: () => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 border-b text-xs"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
    >
      <span className="font-semibold tabular-nums">{count} selected</span>
      <button
        type="button"
        onClick={onClear}
        disabled={!!busy}
        className="hover:underline disabled:opacity-50"
      >
        Clear
      </button>
      <div className="ml-auto flex items-center gap-2">
        {busy ? (
          <span className="tabular-nums text-muted-foreground">
            Working… {busy.done}/{busy.total}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex items-center gap-1.5 rounded-[var(--ap-radius-sm)] border px-2.5 py-1 font-medium hover:bg-[color:var(--ap-bg-hover)]"
              style={{ borderColor: 'var(--ap-border)', color: 'var(--ap-fg)' }}
            >
              <Archive className="size-3.5" />
              Archive
            </button>
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex items-center gap-1.5 rounded-[var(--ap-radius-sm)] border px-2.5 py-1 font-medium hover:bg-[color:var(--ap-bg-hover)]"
              style={{ borderColor: 'var(--ap-border)', color: 'var(--ap-fg)' }}
            >
              <ArchiveRestore className="size-3.5" />
              Restore
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* --------------------------- Sortable header --------------------------- */

function SortHeader({
  label, sortKey, sort, onSort, className,
}: {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort?.key === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-wide hover:text-foreground',
        active ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {label}
      {active
        ? (sort?.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)
        : <ArrowUpDown className="size-3 opacity-50" />}
    </button>
  )
}

export function SortHeaderRow({
  allOnPageSelected, onToggleAllOnPage, sort, onSort,
}: {
  allOnPageSelected: boolean
  onToggleAllOnPage: () => void
  sort: SortState
  onSort: (key: SortKey) => void
}) {
  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b"
      style={{
        borderColor: 'var(--ap-border)',
        background: 'var(--ap-bg-sunken)',
        gridTemplateColumns: 'auto 28px 22px auto auto minmax(0,1fr) auto auto auto auto auto',
      }}
    >
      <input
        type="checkbox"
        checked={allOnPageSelected}
        onChange={onToggleAllOnPage}
        className="h-3.5 w-3.5"
        aria-label="Select all"
      />
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <SortHeader label="Title" sortKey="title" sort={sort} onSort={onSort} />
      <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} className="hidden md:inline-flex" />
      <span className="hidden lg:block text-caption font-semibold uppercase tracking-wide text-muted-foreground">Init</span>
      <SortHeader label="Progress" sortKey="progress" sort={sort} onSort={onSort} />
      <SortHeader label="Owner" sortKey="owner" sort={sort} onSort={onSort} />
      <span></span>
    </div>
  )
}

/* ------------------------------ Pagination ------------------------------ */

export function Pagination({
  page, pageCount, pageSize, total, onPrev, onNext,
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 border-t text-xs"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
    >
      <span className="text-muted-foreground tabular-nums">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page === 1}
          className="px-2 h-7 rounded-[8px] border disabled:opacity-40 hover:bg-card"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          Prev
        </button>
        <span className="tabular-nums text-muted-foreground">{page} / {pageCount}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={page === pageCount}
          className="px-2 h-7 rounded-[8px] border disabled:opacity-40 hover:bg-card"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          Next
        </button>
      </div>
    </div>
  )
}
