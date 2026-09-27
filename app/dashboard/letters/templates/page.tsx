import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { canAdministerLetters } from '@/lib/letter-permissions'
import { LetterTemplatesClient } from '@/features/letters'

// Template management is a letter:admin screen (ADMIN-only `button.letter.admin`).
// The API enforces the same rule; this only avoids rendering a dead page.
export default async function LetterTemplatesPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  if (!(await canAdministerLetters(session.user.id))) redirect('/dashboard/letters')
  return <LetterTemplatesClient />
}
