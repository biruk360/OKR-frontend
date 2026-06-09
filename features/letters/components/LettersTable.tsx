'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { Paperclip, FileText, Copy, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { LETTER_TYPE_LABEL, type LetterStatus } from '@/types'
import { EmptyState } from '@/components/ui'
import LetterStatusBadge from './LetterStatusBadge'
import type { LetterListItem } from '../types'
import { useT } from '../i18n'
import { duplicateLetter } from '../services/lettersApi'

export default function LettersTable({ items, loading }: { items: LetterListItem[]; loading: boolean }) {
  const t = useT()
  if (!loading && items.length === 0) {
    return (
      <div
        className="rounded-[14px] border bg-card shadow-card"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <EmptyState
          title={t('list.empty.title')}
          description={t('list.empty.description')}
          icon={FileText as any}
        />
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-[14px] border bg-card shadow-card"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <table className="min-w-full divide-y divide-[color:var(--ap-border)] text-[13px]">
        <thead className="bg-[color:var(--ap-bg-sunken)]">
          <tr>
            <Th>{t('list.col.reference')}</Th>
            <Th>{t('list.col.subject')}</Th>
            <Th>{t('list.col.customer')}</Th>
            <Th>{t('list.col.preparedBy')}</Th>
            <Th>{t('list.col.signatory')}</Th>
            <Th>{t('list.col.type')}</Th>
            <Th>{t('list.col.date')}</Th>
            <Th>{t('list.col.status')}</Th>
            <Th aria-label="Enclosures" />
            <Th aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--ap-border)]">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <Td><div className="h-3 w-32 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <Td><div className="h-3 w-48 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <Td><div className="h-3 w-32 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <Td><div className="h-3 w-24 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <Td><div className="h-3 w-24 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <Td><div className="h-3 w-20 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <Td><div className="h-3 w-24 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <Td><div className="h-3 w-16 rounded bg-[color:var(--ap-bg-sunken)]" /></Td>
                  <td />
                  <td />
                </tr>
              ))
            : items.map((l) => {
                const typeName =
                  l.letterTypeDef?.name ??
                  LETTER_TYPE_LABEL[l.letterType as keyof typeof LETTER_TYPE_LABEL] ??
                  l.letterType
                return (
                  <LetterRow key={l.id} letter={l} typeName={typeName} />
                )
              })}
        </tbody>
      </table>
    </div>
  )
}

function LetterRow({ letter: l, typeName }: { letter: LetterListItem; typeName: string }) {
  const router = useRouter()
  const [duplicating, setDuplicating] = useState(false)

  async function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation()
    setDuplicating(true)
    try {
      const copy = await duplicateLetter(l.id)
      toast.success(`Duplicated as "${copy.subject}"`)
      router.push(`/dashboard/letters/${copy.id}`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to duplicate letter')
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-[color:var(--ap-bg-sunken)]"
      onClick={() => { window.location.href = `/dashboard/letters/${l.id}` }}
    >
      <Td className="font-mono text-[11px] text-muted-foreground">
        <Link href={`/dashboard/letters/${l.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          {l.referenceNumber || 'DRAFT'}
        </Link>
      </Td>
      <Td>
        <Link href={`/dashboard/letters/${l.id}`} className="font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
          {l.subject}
        </Link>
      </Td>
      <Td className="text-muted-foreground">{l.customerName || '—'}</Td>
      <Td className="text-muted-foreground">{l.preparedBy?.name || '—'}</Td>
      <Td className="text-muted-foreground">{l.signatory?.name || '—'}</Td>
      <Td className="text-muted-foreground">{typeName}</Td>
      <Td className="text-muted-foreground">{format(new Date(l.date), 'd MMM yyyy')}</Td>
      <Td><LetterStatusBadge status={l.status as LetterStatus} /></Td>
      <Td className="text-[11px] text-muted-foreground">
        {l._count?.enclosures ? (
          <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" />{l._count.enclosures}</span>
        ) : null}
      </Td>
      <Td>
        <button
          type="button"
          title="Duplicate letter"
          disabled={duplicating}
          onClick={handleDuplicate}
          className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 disabled:cursor-wait [tr:hover_&]:opacity-100"
        >
          {duplicating
            ? <Loader2 className="size-3.5 animate-spin" />
            : <Copy className="size-3.5" />}
        </button>
      </Td>
    </tr>
  )
}

function Th({ children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>
}
