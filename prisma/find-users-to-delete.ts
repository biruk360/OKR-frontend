import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; email: string; name: string; role: string }>>(`
    SELECT id, email, name, role
    FROM users
    WHERE LOWER(name) LIKE '%alex%'
       OR LOWER(name) LIKE '%rodrig%'
       OR LOWER(name) LIKE '%rodig%'
       OR LOWER(name) LIKE '%david%'
       OR LOWER(name) LIKE '%brown%'
       OR LOWER(email) LIKE 'finance@%'
       OR LOWER(email) LIKE 'hr@%'
       OR LOWER(email) LIKE 'kalkidan@%'
       OR LOWER(email) LIKE 'pm.lead@%'
       OR LOWER(email) LIKE 'admin@%'
       OR LOWER(email) LIKE '%alex%'
       OR LOWER(email) LIKE '%david%'
    ORDER BY email ASC
  `)

  const enriched = []
  for (const u of rows) {
    const counts = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        _count: {
          select: {
            ownedObjectives: true,
            ownedKeyResults: true,
            assignedTodos: true,
            createdTodos: true,
            comments: true,
            keyResultCheckIns: true,
            departmentMemberships: true,
            managerRelationships: true,
            directReports: true,
            notifications: true,
          },
        },
      },
    })
    enriched.push({ ...u, counts: counts?._count })
  }
  console.log(JSON.stringify(enriched, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
