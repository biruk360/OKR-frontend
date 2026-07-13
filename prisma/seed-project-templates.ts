/**
 * Idempotent seed for the 3 system project templates (build spec A2).
 * System templates are `isSystem = true` and non-deletable; re-running updates their
 * structure/name/description in place (keyed on the stable slug stored in structureJson).
 *
 * Run: `npm run db:seed:project-templates`  (tsx prisma/seed-project-templates.ts)
 */

import { prisma } from '../lib/prisma'
import { SYSTEM_TEMPLATES } from '../lib/projects/templates'

async function main(): Promise<void> {
  console.log('[project-templates] Seeding system templates...')

  // Pick a creator: first ADMIN, else first user. System templates need a createdById.
  const admin =
    (await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })) ??
    (await prisma.user.findFirst({ select: { id: true } }))
  if (!admin) {
    console.warn('  ! No users found — cannot set createdById. Seed users first.')
    return
  }

  for (const def of SYSTEM_TEMPLATES) {
    // structureJson carries the slug so we can upsert idempotently without a schema column.
    const structureJson = { slug: def.slug, ...def.structure } as unknown as object
    const existing = await prisma.projectTemplate.findFirst({
      where: { isSystem: true, name: def.name },
      select: { id: true },
    })
    if (existing) {
      await prisma.projectTemplate.update({
        where: { id: existing.id },
        data: { description: def.description, structureJson },
      })
    } else {
      await prisma.projectTemplate.create({
        data: {
          name: def.name,
          description: def.description,
          isSystem: true,
          structureJson,
          createdById: admin.id,
        },
      })
    }
    console.log(`  ✓ ${def.name}`)
  }

  console.log('[project-templates] Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
