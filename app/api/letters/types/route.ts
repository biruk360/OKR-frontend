import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canCreateLetter } from '@/lib/permissions'
import {
  apiBadRequest,
  apiConflict,
  apiForbidden,
  apiSuccess,
  withAuth,
} from '@/lib/api'

// Seed list — these three are guaranteed to exist (auto-upserted on first GET)
// and are the same codes the historical Letter.letterType column uses.
const BUILT_INS: Array<{ code: string; name: string; description: string }> = [
  { code: 'CL', name: 'Cover Letter', description: 'General correspondence and cover documents.' },
  { code: 'OF', name: 'Offer Letter', description: 'Commercial offers and quotations.' },
  { code: 'GR', name: 'Guarantee Letter', description: 'Bank guarantees, performance bonds, and similar.' },
]

async function ensureSeeded(): Promise<void> {
  // Idempotent — the unique constraint makes the upsert safe under
  // concurrent requests.
  await Promise.all(
    BUILT_INS.map((t) =>
      prisma.letterTypeDef.upsert({
        where: { code: t.code },
        create: { code: t.code, name: t.name, description: t.description, isBuiltIn: true },
        update: {},
      })
    )
  )
}

export const GET = withAuth(async () => {
  await ensureSeeded()
  const types = await prisma.letterTypeDef.findMany({
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  })
  return apiSuccess(types)
})

export const POST = withAuth(async (req: NextRequest, { session }) => {
  if (!canCreateLetter(session.user.role)) {
    return apiForbidden('Not permitted to create letter types')
  }
  const body = (await req.json().catch(() => ({}))) as { name?: string; code?: string; description?: string }
  const name = (body.name || '').trim()
  if (name.length < 2 || name.length > 60) {
    return apiBadRequest('Name must be 2–60 characters')
  }

  // If the user didn't give a code, derive a 2-letter one from the name's
  // capital letters / first letters of words. Fall back to the first two
  // letters uppercase. This keeps reference numbers short and predictable.
  const code = ((body.code || '').trim() || deriveCode(name)).toUpperCase()
  if (!/^[A-Z0-9]{2,4}$/.test(code)) {
    return apiBadRequest('Code must be 2–4 letters or digits')
  }

  try {
    const created = await prisma.letterTypeDef.create({
      data: {
        code,
        name,
        description: (body.description || '').trim() || null,
        isBuiltIn: false,
        createdById: session.user.id,
      },
    })
    return apiSuccess(created, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return apiConflict('A letter type with that name or code already exists')
    }
    throw err
  }
})

function deriveCode(name: string): string {
  const caps = (name.match(/[A-Z]/g) || []).slice(0, 4).join('')
  if (caps.length >= 2) return caps
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 4)
    .join('')
    .toUpperCase()
  if (initials.length >= 2) return initials
  return name.slice(0, 2).toUpperCase()
}
