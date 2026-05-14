/**
 * Seeds the letter_role_permissions table with default values matching the
 * original hardcoded rules in lib/permissions.ts.
 *
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-letter-permissions.ts
 * Or via: npx prisma db seed (if configured in package.json)
 *
 * Safe to re-run — uses upsert.
 */

import { PrismaClient } from '@prisma/client'
import { LETTER_PERMISSIONS, SYSTEM_ROLES, DEFAULT_LETTER_MATRIX } from '../lib/letter-permissions'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding letter_role_permissions...')
  let upserted = 0

  for (const role of SYSTEM_ROLES) {
    for (const permission of LETTER_PERMISSIONS) {
      const granted = DEFAULT_LETTER_MATRIX[role]?.[permission] ?? false
      await prisma.letterRolePermission.upsert({
        where: { role_permission: { role, permission } },
        update: { granted },
        create: { role, permission, granted },
      })
      upserted++
    }
  }

  console.log(`✅ Upserted ${upserted} letter role permission rows`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
