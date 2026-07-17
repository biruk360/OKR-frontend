/**
 * A5 — Seed the canonical C1-C6 culture-library entries.
 *
 * Idempotent: upserts on the unique [code, version] composite key, so re-running
 * never duplicates entries and will refresh title/anchors when the source
 * definitions in lib/performance/culture-library.ts change.
 *
 * Run: npm run db:seed:culture-library
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import { CULTURE_CRITERIA, CULTURE_LIBRARY_VERSION } from '../lib/performance/culture-library'

const prisma = new PrismaClient()

export async function seedCultureLibrary(txClient?: Prisma.TransactionClient): Promise<number> {
  const tx = txClient ?? prisma
  let count = 0

  for (const definition of CULTURE_CRITERIA) {
    await tx.criterionLibraryEntry.upsert({
      where: { code_version: { code: definition.code, version: CULTURE_LIBRARY_VERSION } },
      create: {
        code: definition.code,
        name: definition.title,
        version: CULTURE_LIBRARY_VERSION,
        type: 'RUBRIC',
        definitionJson: { title: definition.title, anchors: definition.anchors } as Prisma.InputJsonValue,
        isActive: true,
      },
      update: {
        name: definition.title,
        definitionJson: { title: definition.title, anchors: definition.anchors } as Prisma.InputJsonValue,
        isActive: true,
      },
    })
    count++
  }

  return count
}

async function main() {
  const seeded = await seedCultureLibrary()
  console.log(`✅ Seeded ${seeded} culture-library entries (C1-C6)`)
}

main()
  .catch((error) => {
    console.error('❌ Error seeding culture library:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
