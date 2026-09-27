import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { LetterFormClient } from '@/features/letters'
import { loadLetterDetail } from '@/features/letters/services/letter-pages.server'

interface PageProps {
  params: RouteIdParams
}

export default async function LetterDetailPage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  // Same read scope as GET /api/letters/[id]; out-of-scope or missing → not found.
  const data = await loadLetterDetail(session.user.id, id)
  if (!data) notFound()

  return (
    <LetterFormClient
      initial={data.letter}
      viewer={session.user}
      canAdminister={data.canAdminister}
    />
  )
}
