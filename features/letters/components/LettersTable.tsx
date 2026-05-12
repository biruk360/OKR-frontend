'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { Paperclip } from 'lucide-react'
import { LETTER_TYPE_LABEL, type LetterStatus } from '@/types'
import { EmptyState } from '@/components/ui'
import LetterStatusBadge from './LetterStatusBadge'
import type { LetterListItem } from '../types'

export default function LettersTable({ items, loading }: { items: LetterListItem[]; loading: boolean }) {
  if (!loading && items.length === 0) {
    return (
      <EmptyState
        title="No letters yet"
        description="Create your first letter to get started."
      />
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5">Reference</th>
            <th className="px-4 py-2.5">Subject</th>
            <th className="px-4 py-2.5">Customer</th>
            <th className="px-4 py-2.5">Type</th>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5" aria-label="Enclosures" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-3 w-32 rounded bg-gray-100" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-48 rounded bg-gray-100" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-32 rounded bg-gray-100" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-gray-100" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-gray-100" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-16 rounded bg-gray-100" /></td>
                  <td />
                </tr>
              ))
            : items.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    <Link href={`/dashboard/letters/${l.id}`} className="hover:underline">
                      {l.referenceNumber || 'DRAFT'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/letters/${l.id}`} className="font-medium text-gray-900 hover:underline">
                      {l.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{l.customerName}</td>
                  <td className="px-4 py-3 text-gray-600">{LETTER_TYPE_LABEL[l.letterType as keyof typeof LETTER_TYPE_LABEL]}</td>
                  <td className="px-4 py-3 text-gray-600">{format(new Date(l.date), 'd MMM yyyy')}</td>
                  <td className="px-4 py-3"><LetterStatusBadge status={l.status as LetterStatus} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {l._count?.enclosures ? (
                      <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" />{l._count.enclosures}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}
