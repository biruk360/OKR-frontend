import { apiSuccess, withAuth } from '@/lib/api'
import type { RouteIdParams } from '@/lib/resolve-route-params'

// ActivityLogPanel POSTs to `${apiBase}/${id}/views` on mount. Letters don't track
// per-user view counts yet (FR is silent); accept the beacon as a no-op so the
// shared panel works without errors.
export const POST = withAuth<RouteIdParams>(async () => apiSuccess({ ok: true }))
