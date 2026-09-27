import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { LetterReportsClient } from '@/features/letters'

// FR-16. Data is scoped server-side by GET /api/letters/reports.
export default async function LetterReportsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <LetterReportsClient />
}
