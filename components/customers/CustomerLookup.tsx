'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

interface OdooContact {
  odoo_partner_id: string
  display_name: string
  address?: string
}

interface Props {
  value: { odooPartnerId: string | null; customerName: string }
  onChange: (next: { odooPartnerId: string | null; customerName: string; address?: string }) => void
  disabled?: boolean
}

async function searchOdooContacts(query: string) {
  const response = await fetch(`/api/letters/odoo/contacts?q=${encodeURIComponent(query)}`)
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.success) throw new Error(json?.error || 'Customer lookup failed')
  return json.data as { odooAvailable: boolean; results: OdooContact[] }
}

/** Shared Odoo-backed customer picker used wherever project/client identity is collected. */
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

  const pick = (contact: OdooContact) => {
    onChange({
      odooPartnerId: contact.odoo_partner_id,
      customerName: contact.display_name,
      address: contact.address,
    })
    setQuery(contact.display_name)
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            if (event.target.value !== value.customerName) {
              onChange({ odooPartnerId: null, customerName: event.target.value })
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
        <div className="mt-1 flex items-start gap-1.5 text-body-sm text-warning-700">
          <AlertCircle className="mt-0.5 size-3.5" strokeWidth={1.75} />
          <span>Odoo lookup is unavailable — enter the customer name manually.</span>
        </div>
      )}
      {open && !disabled && (results.length > 0 || loading) && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-card border border-border bg-surface-card shadow-card">
          {loading && <li className="px-3 py-2 text-body-sm text-ink-tertiary">Searching…</li>}
          {results.map((contact) => (
            <li
              key={contact.odoo_partner_id}
              className={cn(
                'cursor-pointer px-3 py-2 text-body transition-colors hover:bg-surface-hover',
                value.odooPartnerId === contact.odoo_partner_id && 'bg-primary/5',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(contact)}
            >
              <div className="font-medium text-ink-primary">{contact.display_name}</div>
              {contact.address && <div className="text-body-sm text-ink-tertiary">{contact.address}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
