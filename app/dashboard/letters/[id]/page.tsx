import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { LetterFormClient } from '@/features/letters'
import type { LetterDetail } from '@/features/letters'

interface PageProps {
  params: RouteIdParams
}

export default async function LetterDetailPage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const letter = await prisma.letter.findUnique({
    where: { id },
    include: {
      preparedBy: { select: { id: true, name: true, avatar: true, email: true } },
      signatory: { select: { id: true, name: true, avatar: true, email: true } },
      enclosures: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, name: true, avatar: true } } },
      },
    },
  })
  if (!letter) notFound()

  return <LetterFormClient initial={letter as unknown as LetterDetail} viewer={session.user} />
}
