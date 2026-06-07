import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiForbidden } from '@/lib/api/apiResponse'

// ---------------------------------------------------------------------------
// POST /api/permissions/export
// Admin-only: Export the full permission configuration as a JSON download.
//
// Includes:
//   - roles
//   - roleDocTypePermissions
//   - featurePermissions
//   - recordScopeRules
//   - docTypeRegistry (with fields)
// ---------------------------------------------------------------------------

export const POST = withRole(['ADMIN'], async (_req, { session }) => {
  // Extra safety — withRole already guards this, but belt-and-suspenders for
  // a destructive/sensitive data endpoint.
  if (session.user.role !== 'ADMIN') {
    return apiForbidden('Only administrators may export permission data')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any

  const [
    roles,
    roleDocTypePermissions,
    featurePermissions,
    recordScopeRules,
    docTypeRegistry,
  ] = await Promise.all([
    db.role.findMany({
      orderBy: [{ hierarchyLevel: 'asc' }, { createdAt: 'asc' }],
    }),
    db.roleDocTypePermission.findMany({
      orderBy: [{ roleId: 'asc' }, { doctypeKey: 'asc' }, { permLevel: 'asc' }],
    }),
    db.featurePermission.findMany({
      orderBy: [{ roleId: 'asc' }, { featureKey: 'asc' }],
    }),
    db.recordScopeRule.findMany({
      orderBy: { createdAt: 'asc' },
    }),
    db.docTypeRegistry.findMany({
      include: { fields: true },
      orderBy: { key: 'asc' },
    }),
  ])

  const snapshot = {
    exportedAt: new Date().toISOString(),
    exportedBy: session.user.id,
    version: 1,
    roles,
    roleDocTypePermissions,
    featurePermissions,
    recordScopeRules,
    docTypeRegistry,
  }

  const isoDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const filename = `permissions-${isoDate}.json`
  const body = JSON.stringify(snapshot, null, 2)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(body, 'utf8')),
    },
  })
})
