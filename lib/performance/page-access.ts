import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveDocTypePermission, resolveFeaturePermission, type DocTypeAction } from '@/lib/permission-resolver'

export async function requirePerformancePage(
  featureKey: string,
  doctypeKey: string,
  action: DocTypeAction = 'read',
): Promise<void> {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const allowed = await Promise.all([
    resolveFeaturePermission(session.user.id, 'module.performance').catch(() => false),
    resolveFeaturePermission(session.user.id, featureKey).catch(() => false),
    resolveDocTypePermission(session.user.id, doctypeKey, action).catch(() => false),
  ])
  if (!allowed.every(Boolean)) redirect('/dashboard')
}
