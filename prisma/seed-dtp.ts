/**
 * Seeds the DTP-only data: trip types and the default settings row.
 * Idempotent — re-running upserts everything.
 *
 * Run: `npx tsx prisma/seed-dtp.ts` (or wire into the main `db:seed` script).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TRIP_TYPES = [
  { code: 'MEETING', label: 'Meeting', icon: 'briefcase', defaultDwellMin: 60, sortOrder: 10 },
  { code: 'PAYMENT_FOLLOWUP', label: 'Payment Followup', icon: 'banknote', defaultDwellMin: 60, sortOrder: 20 },
  { code: 'LETTER_SUBMISSION', label: 'Letter Submission', icon: 'mail', defaultDwellMin: 30, sortOrder: 30 },
  { code: 'CONTRACT_SIGNING', label: 'Contract Signing', icon: 'file-signature', defaultDwellMin: 60, sortOrder: 40 },
  { code: 'PROJECT_VISIT', label: 'Project Visit', icon: 'map-pin', defaultDwellMin: 120, sortOrder: 50 },
  { code: 'BID_SUBMISSION', label: 'Bid Submission', icon: 'file-check', defaultDwellMin: 30, sortOrder: 60 },
  { code: 'BANK_VISIT', label: 'Bank Visit', icon: 'landmark', defaultDwellMin: 90, sortOrder: 70 },
  { code: 'GOVERNMENT_OFFICE', label: 'Government Office', icon: 'building-2', defaultDwellMin: 180, sortOrder: 80 },
  { code: 'CLIENT_PICKUP', label: 'Client Pickup', icon: 'user-round', defaultDwellMin: 30, sortOrder: 90 },
  { code: 'VENDOR_VISIT', label: 'Vendor Visit', icon: 'store', defaultDwellMin: 60, sortOrder: 100 },
  { code: 'TRAINING', label: 'Training', icon: 'graduation-cap', defaultDwellMin: 240, sortOrder: 110 },
  { code: 'OTHER', label: 'Other', icon: 'more-horizontal', defaultDwellMin: 60, sortOrder: 999 },
] as const

async function main() {
  // Trip types
  for (const t of TRIP_TYPES) {
    await prisma.dtpTripType.upsert({
      where: { code: t.code },
      update: { label: t.label, icon: t.icon, defaultDwellMin: t.defaultDwellMin, sortOrder: t.sortOrder, isActive: true },
      create: t,
    })
  }
  console.log(`Seeded ${TRIP_TYPES.length} DTP trip types.`)

  // Default settings (id="default")
  await prisma.dtpSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  })
  console.log('Ensured DTP default settings row exists.')

  // Org-default approval routing — empty (admin fills in via /dashboard/settings/travel).
  const orgRow = await prisma.dtpDepartmentApproval.findFirst({ where: { departmentId: null } })
  if (!orgRow) {
    await prisma.dtpDepartmentApproval.create({
      data: {
        departmentId: null,
        primaryCoordinatorId: null,
        alternateCoordinatorId: null,
        failoverHours: 4,
        managerEndorsementMode: 'OFF',
      },
    })
    console.log('Seeded org-default approval routing row.')
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
