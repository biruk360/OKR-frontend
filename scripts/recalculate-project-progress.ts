/**
 * Recompute project progress from leaf activities for every active project.
 * Run after deploying rollup-rule changes or repairing imported legacy data.
 */
import { prisma } from '../lib/prisma'
import { recalcProjectRollup } from '../lib/projects/rollup'

async function main() {
  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  })

  for (const project of projects) {
    const result = await prisma.$transaction((tx) => recalcProjectRollup(tx, project.id))
    console.log(`${project.code}: ${result.percentComplete}% complete, ${result.percentPlanned}% planned`)
  }

  console.log(`Recalculated ${projects.length} project(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
