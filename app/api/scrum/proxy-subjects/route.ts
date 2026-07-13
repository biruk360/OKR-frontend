import { apiSuccess, withAuth } from '@/lib/api'
import { listProxySubjects } from '@/features/scrum/services/access'

export const GET = withAuth(async (_request, { session }) => {
  return apiSuccess(await listProxySubjects(session))
})
