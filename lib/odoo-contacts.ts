/**
 * Odoo `res.partner` lookup for the Letter Management contact typeahead.
 *
 * The XML-RPC transport now lives in lib/odoo/client.ts — this file is just the
 * contacts query and the dev fallback roster. When credentials are missing we
 * return the mock roster so the Letter Management UI keeps working end-to-end.
 */

import type { OdooContact } from '@/features/letters/types'
import { executeKw, isOdooConfigured as clientIsOdooConfigured } from '@/lib/odoo/client'

const MOCK_CONTACTS: OdooContact[] = [
  { odoo_partner_id: 'odoo-1001', display_name: 'Awash Bank S.C.', address: 'Ras Abebe Aregay St., Addis Ababa' },
  { odoo_partner_id: 'odoo-1002', display_name: 'Ethiopian Airlines', address: 'Bole International Airport, Addis Ababa' },
  { odoo_partner_id: 'odoo-1003', display_name: 'Safaricom Ethiopia', address: 'Bole Road, Friendship Building, Addis Ababa' },
  { odoo_partner_id: 'odoo-1004', display_name: 'Dashen Bank', address: 'Beklobet, Addis Ababa' },
  { odoo_partner_id: 'odoo-1005', display_name: 'Commercial Bank of Ethiopia', address: 'Gambia St., Addis Ababa' },
  { odoo_partner_id: 'odoo-1006', display_name: 'Ministry of Innovation & Technology', address: '5 Kilo, Addis Ababa' },
  { odoo_partner_id: 'odoo-1007', display_name: 'Ato Tesfaye Bekele (Individual)', address: 'CMC, Addis Ababa' },
]

export function isOdooConfigured(): boolean {
  return clientIsOdooConfigured()
}

export interface OdooContactsResult {
  odooAvailable: boolean
  results: OdooContact[]
  /** When `odooAvailable: false` and `error` is set, the UI shows the degraded banner. */
  error?: string
}

export async function searchOdooContacts(query: string): Promise<OdooContactsResult> {
  const q = query.trim()
  if (q.length < 2) return { odooAvailable: true, results: [] }

  if (!clientIsOdooConfigured()) {
    // No creds — return the mock roster. `odooAvailable: true` keeps the standard
    // typeahead UX working in dev; the client can still flag it as a stub.
    const filtered = MOCK_CONTACTS.filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()))
    return { odooAvailable: true, results: filtered }
  }

  try {
    // 4s timeout — Odoo XML-RPC under load can be slow; the form must not hang.
    const raw = await executeKw<unknown>(
      'res.partner',
      'search_read',
      [[['name', 'ilike', q]]],
      { fields: ['id', 'display_name', 'street', 'street2', 'city'], limit: 20 },
      { timeoutMs: 4000 }
    )
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
    const results: OdooContact[] = rows.map((r) => ({
      odoo_partner_id: String(r.id),
      display_name: String(r.display_name ?? r.name ?? ''),
      address: [r.street, r.street2, r.city].filter(Boolean).join(', ') || undefined,
    }))
    return { odooAvailable: true, results }
  } catch (err) {
    console.warn('[odoo-contacts] lookup failed, degrading', err)
    return { odooAvailable: false, results: [], error: (err as Error).message }
  }
}
