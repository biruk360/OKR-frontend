import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { LettersPageClient } from '@/features/letters'

export default async function LettersPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return <LettersPageClient user={session.user} />
}
