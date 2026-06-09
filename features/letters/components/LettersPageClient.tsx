'use client'

import { useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Input, PageHeader } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { LetterStatus, LetterTypeRecord } from '@/types'
import LettersTable from './LettersTable'
import CreateLetterModal from './CreateLetterModal'
import type { LetterListItem } from '../types'
import { listLetters, listLetterTypes } from '../services/lettersApi'
import { LetterLangContext, useT, type LetterLang } from '../i18n'

interface Props {
  user: { id: string; role: string }
}

const STATUS_TABS: Array<'ALL' | 'MINE' | LetterStatus> = [
  'ALL', 'MINE', 'DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ARCHIVED',
]

const PAGE_SIZE = 20

export default function LettersPageClient(props: Props) {
  const [lang, setLang] = useState<LetterLang>('en')
  return (
    <LetterLangContext.Provider value={{ lang, setLang }}>
      <LettersPageInner {...props} />
    </LetterLangContext.Provider>
  )
}

function LettersPageInner(_props: Props) {
  const t = useT()
  const { lang, setLang } = useContext(LetterLangContext)
  const router = useRouter()
  const [items, setItems] = useState<LetterListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ALL' | 'MINE' | LetterStatus>('ALL')
  const [typeFilterId, setTypeFilterId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [types, setTypes] = useState<LetterTypeRecord[]>([])

  // Load types once for the filter pills. Errors are non-fatal — the filter
  // bar just doesn't show type pills.
  useEffect(() => {
    listLetterTypes().then(setTypes).catch(() => setTypes([]))
  }, [])

  const params = useMemo(() => {
    const p: Record<string, unknown> = {}
    if (tab === 'MINE') p.mine = true
    else if (tab !== 'ALL') p.status = tab
    if (tab === 'ARCHIVED') p.includeArchived = true
    if (typeFilterId) p.letterTypeId = typeFilterId
    if (search.trim()) p.search = search.trim()
    p.page = page
    p.limit = PAGE_SIZE
    return p
  }, [tab, typeFilterId, search, page])

  // Reset to page 1 when filters/tab change
  useEffect(() => { setPage(1) }, [tab, typeFilterId, search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listLetters(params)
      .then((r) => {
        if (!cancelled) {
          setItems(r.items)
          setTotal(r.total)
        }
      })
      .catch(() => { if (!cancelled) { setItems([]); setTotal(0) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [params])

  function tabLabel(k: typeof STATUS_TABS[number]): string {
    if (k === 'ALL') return t('list.tab.all')
    if (k === 'MINE') return t('list.tab.mine')
    return t(`list.tab.${k.toLowerCase()}` as any)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  return (
    <div className={cn('space-y-4 p-6', lang === 'am' && 'font-amharic')}>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          <div className="flex items-center gap-2">
            <LangSwitch lang={lang} onChange={setLang} />
            <Button onClick={() => setCreateOpen(true)} className="h-10">
              <Plus className="mr-1.5 size-4" /> {t('list.new')}
            </Button>
          </div>
        }
      />

      {/* Status tabs — apple-style segmented control look */}
      <div
        className="rounded-[14px] border bg-card p-1.5 shadow-card"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_TABS.map((k) => {
            const active = tab === k
            return (
              <button
                key={k}
                onClick={() => setTab(k as any)}
                className={cn(
                  'rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:bg-[color:var(--ap-bg-sunken)] hover:text-foreground'
                )}
              >
                {tabLabel(k)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Search + type filter row */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-[14px] border bg-card px-3 py-2 shadow-card"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('list.search')}
            className="h-9 pl-9"
          />
        </div>
        {types.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTypeFilterId(null)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                typeFilterId === null
                  ? 'bg-foreground text-background'
                  : 'bg-[color:var(--ap-bg-sunken)] text-muted-foreground hover:text-foreground'
              )}
            >
              All types
            </button>
            {types.map((typ) => (
              <button
                key={typ.id}
                onClick={() => setTypeFilterId(typ.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  typeFilterId === typ.id
                    ? 'bg-foreground text-background'
                    : 'bg-[color:var(--ap-bg-sunken)] text-muted-foreground hover:text-foreground'
                )}
                title={typ.description ?? undefined}
              >
                <FileText className="size-3" />
                {typ.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <LettersTable items={items} loading={loading} />

      {/* Pagination */}
      {!loading && total > 0 && (
        <div
          className="flex items-center justify-between rounded-[14px] border bg-card px-4 py-2.5 shadow-card"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <span className="text-[12px] text-muted-foreground">
            {start}–{end} of {total} letters
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-[color:var(--ap-bg-sunken)] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-[12px] text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={cn(
                      'h-8 min-w-[32px] rounded-[8px] px-2 text-[12px] font-medium transition-colors',
                      page === p
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-[color:var(--ap-bg-sunken)] hover:text-foreground'
                    )}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-[color:var(--ap-bg-sunken)] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      <CreateLetterModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(letter) => {
          setCreateOpen(false)
          router.push(`/dashboard/letters/${letter.id}`)
        }}
      />
    </div>
  )
}

function LangSwitch({ lang, onChange }: { lang: LetterLang; onChange: (l: LetterLang) => void }) {
  return (
    <div
      className="inline-flex h-10 overflow-hidden rounded-[10px] border bg-card text-[12px] shadow-sm"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      {(['en', 'am'] as LetterLang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={cn(
            'px-3 font-medium transition-colors',
            lang === l ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {l === 'en' ? 'EN' : 'አማ'}
        </button>
      ))}
    </div>
  )
}
