import { NextRequest } from 'next/server'
import { apiSuccess, withAuth } from '@/lib/api'
import { searchOdooContacts } from '@/lib/odoo-contacts'

// FR-3: Odoo contact lookup. Real XML-RPC client in `lib/odoo-contacts.ts`
// — falls back to a mock roster when `ODOO_URL` / `ODOO_DB` / `ODOO_USER`
// / `ODOO_KEY` env vars are not set.
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const result = await searchOdooContacts(q)
  return apiSuccess(result)
})
