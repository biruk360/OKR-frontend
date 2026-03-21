/**
 * Deletes all users, objectives, key results, and dependent rows (todos, comments, etc.).
 * Keeps: departments, timeframes, labels, system_settings.
 * Run: npx tsx prisma/wipe-users-objectives-krs.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function deleteCommentsDeepestFirst() {
  let deleted = 1
  while (deleted > 0) {
    const r = await prisma.comment.deleteMany({
      where: { parentId: { not: null } },
    })
    deleted = r.count
  }
  await prisma.comment.deleteMany()
}

async function main() {
  await prisma.todo.deleteMany()
  await deleteCommentsDeepestFirst()
  await prisma.notification.deleteMany()
  await prisma.objectiveLabel.deleteMany()
  await prisma.keyResult.deleteMany()
  await prisma.objective.updateMany({ data: { parentObjectiveId: null } })
  await prisma.objective.deleteMany()
  await prisma.departmentMembership.deleteMany()
  await prisma.managerRelationship.deleteMany()
  await prisma.user.deleteMany()

  console.log('Wiped: users, objectives, key results, todos, comments, notifications, objective labels, memberships, manager links.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
