import { apiSuccess, withRole } from '@/lib/api'
import { testProjectCreationAiConnection } from '@/lib/ai/connection-test'

export const POST = withRole('ADMIN', async (_request, { session }) => {
  const result = await testProjectCreationAiConnection(session.user.id)
  return apiSuccess(result, {
    message: result.ok ? 'OpenAI connection verified' : 'OpenAI connection test completed',
  })
})
