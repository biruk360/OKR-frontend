'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { searchOdooContacts } from '../services/lettersApi'
import type { OdooContact } from '../types'

interface Props {
  value: { odooPartnerId: string | null; customerName: string }
  onChange: (next: { odooPartnerId: string | null; customerName: string; address?: string }) => void
  disabled?: boolean
}

export default function CustomerLookup({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value.customerName)
  const [results, setResults] = useState<OdooContact[]>([])
  const [loading, setLoading] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setQuery(value.customerName) }, [value.customerName])

  useEffect(() => {
    if (disabled) return
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchOdooContacts(query.trim())
        setResults(data.results)
        setDegraded(!data.odooAvailable)
      } catch {
        setDegraded(true)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, disabled])

  function pick(c: OdooContact) {
    onChange({ odooPartnerId: c.odoo_partner_id, customerName: c.display_name, address: c.address })
    setQuery(c.display_name)
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            // Treat any free-form edit as a manual entry — clear the Odoo link
            // unless the typed text still matches the previously-linked name.
            if (e.target.value !== value.customerName) {
              onChange({ odooPartnerId: null, customerName: e.target.value })
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search Odoo contacts…"
          className="pl-8"
          disabled={disabled}
        />
      </div>
      {degraded && (
        <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 size-3.5" />
          <span>Odoo lookup is unavailable — enter the customer name manually.</span>
        </div>
      )}
      {open && !disabled && (results.length > 0 || loading) && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && <li className="px-3 py-2 text-xs text-gray-500">Searching…</li>}
          {results.map((c) => (
            <li
              key={c.odoo_partner_id}
              className={cn(
                'cursor-pointer px-3 py-2 text-sm hover:bg-blue-50',
                value.odooPartnerId === c.odoo_partner_id && 'bg-blue-50'
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              <div className="font-medium text-gray-900">{c.display_name}</div>
              {c.address && <div className="text-xs text-gray-500">{c.address}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
