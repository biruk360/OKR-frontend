import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { canAdministerLetters } from '@/lib/letter-permissions'
import { LettersPageClient } from '@/features/letters'

export default async function LettersPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const canAdminister = await canAdministerLetters(session.user.id)
  return <LettersPageClient user={session.user} canAdminister={canAdminister} />
}
