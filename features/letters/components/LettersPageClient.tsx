'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { PageHeader, Button, Input } from '@/components/ui'
import {
  LETTER_STATUS_LABEL,
  LETTER_TYPE_LABEL,
  type LetterStatus,
  type LetterType,
} from '@/types'
import LettersTable from './LettersTable'
import CreateLetterModal from './CreateLetterModal'
import type { LetterListItem } from '../types'
import { listLetters } from '../services/lettersApi'

interface Props {
  user: { id: string; role: string }
}

const STATUS_TABS: ({ key: 'ALL' } | { key: 'MINE' } | { key: LetterStatus })[] = [
  { key: 'ALL' },
  { key: 'MINE' },
  { key: 'DRAFT' },
  { key: 'SUBMITTED' },
  { key: 'APPROVED' },
  { key: 'SENT' },
  { key: 'ARCHIVED' },
]

const TYPE_FILTERS: { key: 'ALL' | LetterType; label: string }[] = [
  { key: 'ALL', label: 'All types' },
  { key: 'COVER', label: 'Cover' },
  { key: 'OFFER', label: 'Offer' },
  { key: 'GUARANTEE', label: 'Guarantee' },
]

export default function LettersPageClient(_props: Props) {
  const router = useRouter()
  const [items, setItems] = useState<LetterListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ALL' | 'MINE' | LetterStatus>('ALL')
  const [letterType, setLetterType] = useState<'ALL' | LetterType>('ALL')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const params = useMemo(() => {
    const p: Record<string, unknown> = {}
    if (tab === 'MINE') p.mine = true
    else if (tab !== 'ALL') p.status = tab
    if (tab === 'ARCHIVED') p.includeArchived = true
    if (letterType !== 'ALL') p.letterType = letterType
    if (search.trim()) p.search = search.trim()
    return p
  }, [tab, letterType, search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listLetters(params)
      .then((r) => { if (!cancelled) setItems(r.items) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [params])

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Letters"
        description="Cover, offer, and guarantee letters — drafted, approved, and dispatched."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" /> New Letter
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => {
          const label =
            t.key === 'ALL' ? 'All' : t.key === 'MINE' ? 'My Letters' : LETTER_STATUS_LABEL[t.key]
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                active ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, subject, or customer…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setLetterType(f.key as any)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                letterType === f.key
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <LettersTable items={items} loading={loading} />

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
