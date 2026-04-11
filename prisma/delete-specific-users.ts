import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TARGET_IDS = [
  'cmnkaabbq00055yhx229m76w7', // admin@company.com
  'cmnkaabbs00075yhxfed98wyk', // engineer1@company.com (Alex Rodriguez)
  'cmn071us80008w90zbnjr82eb', // finance@360ground.com
  'cmn071us90009w90zhcisaq41', // hr@360ground.com
  'cmn071us60005w90zm42gk81d', // kalkidan@360ground.com
  'cmnkaabbt00085yhxwztrn2j6', // marketer1@company.com (David Brown)
  'cmn071usa000bw90z8li9re76', // pm.lead@360ground.com
]

async function deleteCommentsByAuthorsDeepestFirst(authorIds: string[]) {
  let total = 0
  while (true) {
    const leafReplies = await prisma.comment.findMany({
      where: { authorId: { in: authorIds }, replies: { none: {} } },
      select: { id: true },
    })
    if (leafReplies.length === 0) break
    const r = await prisma.comment.deleteMany({ where: { id: { in: leafReplies.map(c => c.id) } } })
    total += r.count
  }
  return total
}

async function main() {
  const ids = TARGET_IDS

  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
  console.log(`Resolved ${users.length} users:`)
  users.forEach(u => console.log(`  - ${u.email} (${u.id})`))
  if (users.length !== ids.length) {
    throw new Error(`Expected ${ids.length} users, found ${users.length}. Aborting.`)
  }

  const ownedObjectives = await prisma.objective.findMany({
    where: { ownerId: { in: ids } }, select: { id: true },
  })
  const ownedObjectiveIds = ownedObjectives.map(o => o.id)

  const ownedKeyResults = await prisma.keyResult.findMany({
    where: { ownerId: { in: ids } }, select: { id: true },
  })
  const ownedKeyResultIds = ownedKeyResults.map(k => k.id)

  console.log(`\nOwned by deletees: ${ownedObjectiveIds.length} objectives, ${ownedKeyResultIds.length} key results`)

  await prisma.$transaction(async (tx) => {
    // 1. Comments authored by these users — delete deepest replies first
    let leafTotal = 0
    while (true) {
      const leafReplies = await tx.comment.findMany({
        where: { authorId: { in: ids }, replies: { none: {} } },
        select: { id: true },
      })
      if (leafReplies.length === 0) break
      const r = await tx.comment.deleteMany({ where: { id: { in: leafReplies.map(c => c.id) } } })
      leafTotal += r.count
    }
    console.log(`Deleted ${leafTotal} comments authored by deletees`)

    // 2. Todos assigned to or created by these users
    const todoR = await tx.todo.deleteMany({
      where: { OR: [{ assigneeId: { in: ids } }, { creatorId: { in: ids } }] },
    })
    console.log(`Deleted ${todoR.count} todos`)

    // 3. Key results owned by these users (cascades remaining todos/comments/checkins on those KRs)
    //    First null out parent links of comments under these KRs (handled by cascade)
    const krR = await tx.keyResult.deleteMany({ where: { id: { in: ownedKeyResultIds } } })
    console.log(`Deleted ${krR.count} key results owned by deletees`)

    // 4. Null parent links on child objectives whose parent is owned by a deletee
    if (ownedObjectiveIds.length > 0) {
      const childUpdate = await tx.objective.updateMany({
        where: { parentObjectiveId: { in: ownedObjectiveIds } },
        data: { parentObjectiveId: null },
      })
      console.log(`Detached ${childUpdate.count} child objectives from to-be-deleted parents`)
    }

    // 5. Delete objectives owned by these users (cascades KRs, comments, objective_labels)
    const objR = await tx.objective.deleteMany({ where: { id: { in: ownedObjectiveIds } } })
    console.log(`Deleted ${objR.count} objectives owned by deletees`)

    // 6. Delete the users themselves (cascades notifications, dept memberships, manager rels, sets client_error_logs.userId NULL)
    const userR = await tx.user.deleteMany({ where: { id: { in: ids } } })
    console.log(`Deleted ${userR.count} users`)
  })

  // Verify
  const remaining = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
  console.log(`\nVerification: ${remaining.length} of ${ids.length} target users remain (should be 0)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
