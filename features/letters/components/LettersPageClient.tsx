'use client'

import { useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { PageHeader, Button, Input } from '@/components/ui'
import {
  type LetterStatus,
  type LetterType,
} from '@/types'
import LettersTable from './LettersTable'
import CreateLetterModal from './CreateLetterModal'
import type { LetterListItem } from '../types'
import { listLetters } from '../services/lettersApi'
import { LetterLangContext, useT, type LetterLang } from '../i18n'

interface Props {
  user: { id: string; role: string }
}

const STATUS_TABS: Array<'ALL' | 'MINE' | LetterStatus> = [
  'ALL', 'MINE', 'DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ARCHIVED',
]

const TYPE_FILTERS: Array<'ALL' | LetterType> = ['ALL', 'COVER', 'OFFER', 'GUARANTEE']

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

  function tabLabel(k: typeof STATUS_TABS[number]): string {
    if (k === 'ALL') return t('list.tab.all')
    if (k === 'MINE') return t('list.tab.mine')
    return t(`list.tab.${k.toLowerCase()}` as any)
  }
  function typeLabel(k: typeof TYPE_FILTERS[number]): string {
    if (k === 'ALL') return t('list.type.all')
    return t(`list.type.${k.toLowerCase()}` as any)
  }

  return (
    <div className={`space-y-4 p-6 ${lang === 'am' ? 'font-amharic' : ''}`}>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white text-xs">
              <button type="button" onClick={() => setLang('en')}
                className={`px-2.5 py-1 ${lang === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>EN</button>
              <button type="button" onClick={() => setLang('am')}
                className={`px-2.5 py-1 ${lang === 'am' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>አማ</button>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 size-4" /> {t('list.new')}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((k) => {
          const active = tab === k
          return (
            <button
              key={k}
              onClick={() => setTab(k as any)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                active ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {tabLabel(k)}
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
            placeholder={t('list.search')}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5">
          {TYPE_FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setLetterType(k as any)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                letterType === k
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {typeLabel(k)}
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
