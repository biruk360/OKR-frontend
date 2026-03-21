/**
 * One-off: merge demo users into a single Biruk (biruk@360ground.com), remove listed accounts.
 * Run: npx tsx prisma/migrate-consolidate-biruk.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const TARGET_EMAIL = 'biruk@360ground.com'
const TARGET_NAME = 'Biruk Hailu'

const MERGE_FIRST_EMAIL = 'biruk.hailu@360ground.et'

const REMOVE_EMAILS = [
  'ceo@company.com',
  'engineering.lead@company.com',
  'marketing.lead@company.com',
  'sales.lead@company.com',
  'engineer2@company.com',
  'salesrep1@company.com',
]

async function reassignAll(fromId: string, toId: string) {
  await prisma.objective.updateMany({
    where: { ownerId: fromId },
    data: { ownerId: toId },
  })
  await prisma.keyResult.updateMany({
    where: { ownerId: fromId },
    data: { ownerId: toId },
  })
  await prisma.todo.updateMany({
    where: { assigneeId: fromId },
    data: { assigneeId: toId },
  })
  await prisma.todo.updateMany({
    where: { creatorId: fromId },
    data: { creatorId: toId },
  })
  await prisma.comment.updateMany({
    where: { authorId: fromId },
    data: { authorId: toId },
  })
  await prisma.notification.updateMany({
    where: { userId: fromId },
    data: { userId: toId },
  })
}

async function stripUser(id: string) {
  await prisma.departmentMembership.deleteMany({ where: { userId: id } })
  await prisma.managerRelationship.deleteMany({
    where: { OR: [{ managerId: id }, { directReportId: id }] },
  })
  await prisma.user.delete({ where: { id } })
}

async function main() {
  const hashed =
    (await prisma.user.findUnique({ where: { email: MERGE_FIRST_EMAIL } }))
      ?.password ?? (await bcrypt.hash('admin123', 12))

  const biruk = await prisma.user.upsert({
    where: { email: TARGET_EMAIL },
    update: {
      name: TARGET_NAME,
      role: 'ADMIN',
    },
    create: {
      email: TARGET_EMAIL,
      name: TARGET_NAME,
      password: hashed,
      role: 'ADMIN',
    },
  })

  const mergeIds: string[] = []

  const oldBiruk = await prisma.user.findUnique({
    where: { email: MERGE_FIRST_EMAIL },
  })
  if (oldBiruk && oldBiruk.id !== biruk.id) mergeIds.push(oldBiruk.id)

  for (const email of REMOVE_EMAILS) {
    const u = await prisma.user.findUnique({ where: { email } })
    if (u && u.id !== biruk.id) mergeIds.push(u.id)
  }

  const uniqueMerge = Array.from(new Set(mergeIds))

  for (const fromId of uniqueMerge) {
    await reassignAll(fromId, biruk.id)
    await stripUser(fromId)
    console.log('Merged & removed user id', fromId)
  }

  console.log('Canonical Biruk:', TARGET_EMAIL, biruk.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
