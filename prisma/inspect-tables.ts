import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )
  console.log('Tables:', tables.map(t => t.name).join(', '))

  const todosCount = await prisma.$queryRawUnsafe<Array<{ c: number }>>(`SELECT COUNT(*) as c FROM todos`).catch(() => null)
  console.log('todos rows:', todosCount?.[0]?.c ?? 'N/A (table missing)')

  const todosCols = await prisma.$queryRawUnsafe<Array<{ name: string; type: string }>>(
    `PRAGMA table_info(todos)`
  ).catch(() => [])
  console.log('todos columns:', todosCols.map(c => c.name))

  const krCols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info(key_results)`
  )
  console.log('key_results columns:', krCols.map(c => c.name))

  const objCols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info(objectives)`
  )
  console.log('objectives columns:', objCols.map(c => c.name))
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
