/**
 * One-time / idempotent import: 360Ground FY Aug 2025 – Jul 2026 OKRs.
 * Run: npx tsx prisma/seed-360ground-fy2026.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const TF_NAME = 'FY Aug 2025 – Jul 30, 2026'
const IMPORT_NOTE = '[360GROUND_FY2026]'

const aug1_2025 = new Date(2025, 7, 1)
const jul30_2026 = new Date(2026, 6, 30, 23, 59, 59, 999)

type KrInput = {
  title: string
  description: string
  targetValue: number
  unit: string
  ownerId: string
  startValue?: number
  currentValue?: number
}

async function main() {
  const hashed = await bcrypt.hash('admin123', 12)

  const timeframe = await prisma.timeframe.upsert({
    where: { name: TF_NAME },
    update: {
      startDate: aug1_2025,
      endDate: jul30_2026,
      type: 'YEARLY',
    },
    create: {
      name: TF_NAME,
      type: 'YEARLY',
      startDate: aug1_2025,
      endDate: jul30_2026,
    },
  })

  const div1 = await prisma.department.upsert({
    where: { name: 'Division 1 — Strategic Pursuits' },
    update: {
      description:
        'Mission: Win large-scale, multi-year digital transformation mandates that position 360Ground as Ethiopia\'s essential national technology partner. Revenue target: ETB 100M. Lead: Biruk Hailu. Support: Beza.',
    },
    create: {
      name: 'Division 1 — Strategic Pursuits',
      description:
        'Mission: Win large-scale, multi-year digital transformation mandates that position 360Ground as Ethiopia\'s essential national technology partner. Revenue target: ETB 100M. Lead: Biruk Hailu. Support: Beza.',
    },
  })

  const biruk = await prisma.user.upsert({
    where: { email: 'biruk@360ground.com' },
    update: { name: 'Biruk Hailu', role: 'ADMIN' },
    create: {
      email: 'biruk@360ground.com',
      name: 'Biruk Hailu',
      password: hashed,
      role: 'ADMIN',
    },
  })

  const beza = await prisma.user.upsert({
    where: { email: 'beza@360ground.com' },
    update: { name: 'Beza' },
    create: {
      email: 'beza@360ground.com',
      name: 'Beza',
      password: hashed,
      role: 'DEPARTMENT_LEAD',
    },
  })

  const eden = await prisma.user.upsert({
    where: { email: 'eden@360ground.com' },
    update: { name: 'Eden' },
    create: {
      email: 'eden@360ground.com',
      name: 'Eden',
      password: hashed,
      role: 'EMPLOYEE',
    },
  })

  const kalkidan = await prisma.user.upsert({
    where: { email: 'kalkidan@360ground.com' },
    update: { name: 'Kalkidan' },
    create: {
      email: 'kalkidan@360ground.com',
      name: 'Kalkidan',
      password: hashed,
      role: 'EMPLOYEE',
    },
  })

  const delivery = await prisma.user.upsert({
    where: { email: 'delivery@360ground.com' },
    update: { name: 'Delivery Lead' },
    create: {
      email: 'delivery@360ground.com',
      name: 'Delivery Lead',
      password: hashed,
      role: 'DEPARTMENT_LEAD',
    },
  })

  const allSes = await prisma.user.upsert({
    where: { email: 'all.ses@360ground.com' },
    update: { name: 'All SEs (team)' },
    create: {
      email: 'all.ses@360ground.com',
      name: 'All SEs (team)',
      password: hashed,
      role: 'EMPLOYEE',
    },
  })

  const finance = await prisma.user.upsert({
    where: { email: 'finance@360ground.com' },
    update: { name: 'Finance' },
    create: {
      email: 'finance@360ground.com',
      name: 'Finance',
      password: hashed,
      role: 'EMPLOYEE',
    },
  })

  const hr = await prisma.user.upsert({
    where: { email: 'hr@360ground.com' },
    update: { name: 'HR' },
    create: {
      email: 'hr@360ground.com',
      name: 'HR',
      password: hashed,
      role: 'EMPLOYEE',
    },
  })

  const wessagn = await prisma.user.upsert({
    where: { email: 'wessagn@360ground.com' },
    update: { name: 'Wessagn' },
    create: {
      email: 'wessagn@360ground.com',
      name: 'Wessagn',
      password: hashed,
      role: 'EMPLOYEE',
    },
  })

  const pm = await prisma.user.upsert({
    where: { email: 'pm.lead@360ground.com' },
    update: { name: 'PM Lead' },
    create: {
      email: 'pm.lead@360ground.com',
      name: 'PM Lead',
      password: hashed,
      role: 'DEPARTMENT_LEAD',
    },
  })

  for (const [userId, departmentId, role] of [
    [biruk.id, div1.id, 'Lead'],
    [beza.id, div1.id, 'Member'],
  ] as const) {
    await prisma.departmentMembership.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      update: { role },
      create: { userId, departmentId, role },
    })
  }

  for (const directReportId of [beza.id, delivery.id, eden.id, wessagn.id, finance.id]) {
    await prisma.managerRelationship.upsert({
      where: {
        managerId_directReportId: { managerId: biruk.id, directReportId },
      },
      update: {},
      create: {
        managerId: biruk.id,
        directReportId,
      },
    })
  }

  const existingO1 = await prisma.objective.findFirst({
    where: {
      timeframeId: timeframe.id,
      title: {
        contains: 'ETB 200M in Revenue',
      },
    },
  })

  if (existingO1) {
    console.log('FY2026 360Ground OKRs already present (skipping objective/KR create).')
    console.log('Login: biruk@360ground.com / admin123')
    return
  }

  const sponsor = `Sponsor: Biruk Hailu, Founder & CEO. Period: August 2025 – July 30, 2026. ${IMPORT_NOTE}`

  const o1 = await prisma.objective.create({
    data: {
      title:
        'Achieve ETB 200M in Revenue and/or Signed Contracts by July 30, 2026',
      description: sponsor,
      level: 'COMPANY',
      ownerId: biruk.id,
      timeframeId: timeframe.id,
      startDate: aug1_2025,
      endDate: jul30_2026,
    },
  })

  const o2 = await prisma.objective.create({
    data: {
      title: 'Protect and Grow Existing Client Revenue',
      description: sponsor,
      level: 'COMPANY',
      ownerId: biruk.id,
      timeframeId: timeframe.id,
      startDate: aug1_2025,
      endDate: jul30_2026,
    },
  })

  const o3 = await prisma.objective.create({
    data: {
      title: 'Build Delivery Capacity to Support the Revenue Target',
      description: sponsor,
      level: 'COMPANY',
      ownerId: biruk.id,
      timeframeId: timeframe.id,
      startDate: aug1_2025,
      endDate: jul30_2026,
    },
  })

  const oSp1 = await prisma.objective.create({
    data: {
      title: 'Dominate eGovernment & AI Contracts',
      description: `Division 1 — Strategic Pursuits. ${IMPORT_NOTE}`,
      level: 'DEPARTMENT',
      ownerId: biruk.id,
      timeframeId: timeframe.id,
      departmentId: div1.id,
      parentObjectiveId: o1.id,
      startDate: aug1_2025,
      endDate: jul30_2026,
    },
  })

  const oSp2 = await prisma.objective.create({
    data: {
      title: 'Pioneer PPP & Donor-Funded Revenue',
      description: `Division 1 — Strategic Pursuits. ${IMPORT_NOTE}`,
      level: 'DEPARTMENT',
      ownerId: biruk.id,
      timeframeId: timeframe.id,
      departmentId: div1.id,
      parentObjectiveId: o1.id,
      startDate: aug1_2025,
      endDate: jul30_2026,
    },
  })

  const oBz1 = await prisma.objective.create({
    data: {
      title: 'Build and Shape a High-Value Government Pipeline',
      description: `Beza — Strategic Presales & Pipeline Architect. ${IMPORT_NOTE}`,
      level: 'INDIVIDUAL',
      ownerId: beza.id,
      timeframeId: timeframe.id,
      parentObjectiveId: oSp1.id,
      startDate: aug1_2025,
      endDate: jul30_2026,
    },
  })

  async function addKeyResults(objectiveId: string, rows: KrInput[]) {
    for (const r of rows) {
      await prisma.keyResult.create({
        data: {
          title: r.title,
          description: r.description,
          startValue: r.startValue ?? 0,
          targetValue: r.targetValue,
          currentValue: r.currentValue ?? 0,
          unit: r.unit,
          ownerId: r.ownerId,
          objectiveId,
        },
      })
    }
  }

  await addKeyResults(o1.id, [
    {
      title: 'KR 1.1 — Cumulative contracts and/or revenue',
      description:
        'Recognize or sign ETB 200M in total cumulative project contracts and/or revenue by July 30, 2026. Owner: All (CEO sponsor).',
      targetValue: 200,
      unit: 'M ETB',
      ownerId: biruk.id,
    },
    {
      title: 'KR 1.2 — Live tracker & weekly reviews',
      description:
        'Maintain a live signed-contract + recognized-revenue tracker updated weekly by each SE; reviewed every Monday. Owner: Biruk.',
      targetValue: 100,
      unit: '% weeks covered',
      ownerId: biruk.id,
    },
    {
      title: 'KR 1.3 — Deferred revenue conversion (MINT + INSA)',
      description:
        'Convert ETB 13.1M deferred revenue into recognized revenue through on-schedule delivery. Owner: Delivery.',
      targetValue: 13.1,
      unit: 'M ETB',
      ownerId: delivery.id,
    },
    {
      title: 'KR 1.4 — Blended bid win rate',
      description:
        'Achieve blended bid win rate ≥50% on formally submitted proposals above ETB 1M. Owner: All SEs.',
      targetValue: 50,
      unit: '%',
      ownerId: allSes.id,
    },
    {
      title: 'KR 1.5 — Mega-deals (contracts > ETB 5M)',
      description:
        'Win at least 15 contracts above ETB 5M each across all teams. Owner: All.',
      targetValue: 15,
      unit: 'contracts',
      ownerId: biruk.id,
    },
  ])

  await addKeyResults(o2.id, [
    {
      title: 'KR 2.1 — MINT/INSA milestone delivery',
      description:
        'Deliver deferred MINT/INSA projects on schedule to unlock remaining milestone payments. Owner: Delivery + Biruk.',
      targetValue: 100,
      unit: '% milestones',
      ownerId: biruk.id,
    },
    {
      title: 'KR 2.2 — Cross-sell / upsell to existing clients',
      description:
        'Generate ETB 20M from cross-selling and up-selling (AI chatbot, ERP, licensing, support). Owner: All SEs.',
      targetValue: 20,
      unit: 'M ETB',
      ownerId: allSes.id,
    },
    {
      title: 'KR 2.3 — Support & maintenance SLA growth',
      description:
        'Increase active support & maintenance SLA contracts by 50%. Owner: Eden/Kalkidan (KRs assigned to Eden; partner: Kalkidan).',
      targetValue: 50,
      unit: '% growth',
      ownerId: eden.id,
    },
    {
      title: 'KR 2.4 — CSAT on active deliveries',
      description:
        'Achieve ≥9/10 CSAT on all active project deliveries. Owner: PM / SEs.',
      targetValue: 9,
      unit: '/10',
      ownerId: pm.id,
    },
  ])

  await addKeyResults(o3.id, [
    {
      title: 'KR 3.1 — Three strategic hires',
      description:
        'Hire Marketing Manager, Senior SE #7, Bid/Proposal Writer by April 30, 2026. Owner: Biruk/HR.',
      targetValue: 3,
      unit: 'hires',
      ownerId: biruk.id,
    },
    {
      title: 'KR 3.2 — FY2025 audit',
      description:
        'Finalize clean, unqualified FY2025 audit by May 2026. Owner: Finance.',
      targetValue: 1,
      unit: 'audit complete',
      ownerId: finance.id,
    },
    {
      title: 'KR 3.3 — Go/No-Go on bids > ETB 1M',
      description:
        '100% of bids above ETB 1M pass mandatory Go/No-Go before purchase. Owner: All SEs.',
      targetValue: 100,
      unit: '%',
      ownerId: allSes.id,
    },
    {
      title: 'KR 3.4 — CRM / ERP logging discipline',
      description:
        'Log 100% of bid activities, leads, and outcomes in ERP/CRM within 24h. Owner: Wessagn + all SEs.',
      targetValue: 100,
      unit: '%',
      ownerId: wessagn.id,
    },
    {
      title: 'KR 3.5 — Microsoft Gold Partner',
      description:
        'Achieve Microsoft Gold Partner status in at least one competency by June 2026. Owner: Eden + Biruk.',
      targetValue: 1,
      unit: 'competency',
      ownerId: eden.id,
    },
  ])

  await addKeyResults(oSp1.id, [
    {
      title: 'O-SP1.1 — eGovernment & expansion revenue',
      description: 'ETB 60M in new and expansion eGovernment projects.',
      targetValue: 60,
      unit: 'M ETB',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP1.2 — AI pilot projects in ministries',
      description: '5 AI pilot projects signed within key ministries.',
      targetValue: 5,
      unit: 'pilots',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP1.3 — Trusted Technical Advisor',
      description:
        '≥2 ministries invite co-development of technical specs before public tender.',
      targetValue: 2,
      unit: 'ministries',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP1.4 — Re-engage cancelled government bids',
      description: '≥5 previously cancelled high-value bids (>ETB 5M) re-engaged.',
      targetValue: 5,
      unit: 'bids',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP1.5 — National SMS Gateway expansion',
      description: 'At least 1 additional ministry integration mandate.',
      targetValue: 1,
      unit: 'ministry',
      ownerId: biruk.id,
    },
  ])

  await addKeyResults(oSp2.id, [
    {
      title: 'O-SP2.1 — PPP, donor, eService revenue',
      description:
        'ETB 40M via eService, PPP, and donor-funded projects. Owner: Biruk + Beza.',
      targetValue: 40,
      unit: 'M ETB',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP2.2 — Donor programme awards',
      description:
        'Submit ≥2 major proposals (World Bank, UNDP, GIZ) and secure ≥1 award.',
      targetValue: 1,
      unit: 'awards',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP2.3 — PPP agreements',
      description: '≥2 PPP agreements with government (revenue-share or co-investment).',
      targetValue: 2,
      unit: 'PPPs',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP2.4 — Multi-year strategic SLAs',
      description:
        'Convert ≥3 government project clients into multi-year SLA partners. Owner: Biruk + Delivery.',
      targetValue: 3,
      unit: 'SLAs',
      ownerId: biruk.id,
    },
    {
      title: 'O-SP2.5 — Donor-fundable concepts',
      description:
        '3 project concepts with MoU sign-off (e.g. digital agriculture, financial inclusion, public health tech).',
      targetValue: 3,
      unit: 'concepts',
      ownerId: biruk.id,
    },
  ])

  await addKeyResults(oBz1.id, [
    {
      title: 'O-BZ1.1 — Qualified pipeline',
      description: 'ETB 300M+ qualified pipeline via discovery, workshops, C-level.',
      targetValue: 300,
      unit: 'M ETB pipeline',
      ownerId: beza.id,
    },
    {
      title: 'O-BZ1.2 — Shaped opportunities',
      description:
        '≥20 qualified opportunities shaped (our solutions in client requirements pre-tender).',
      targetValue: 20,
      unit: 'opportunities',
      ownerId: beza.id,
    },
    {
      title: 'O-BZ1.3 — Signed revenue',
      description: 'ETB 50M new and expansion signed revenue for the fiscal year.',
      targetValue: 50,
      unit: 'M ETB',
      ownerId: beza.id,
    },
    {
      title: 'O-BZ1.4 — Cross-sell AI, ERP, Fleet',
      description: 'ETB 15M from cross-sell to high-potential clients.',
      targetValue: 15,
      unit: 'M ETB',
      ownerId: beza.id,
    },
    {
      title: 'O-BZ1.5 — Converted cancelled tenders',
      description: '≥10 cancelled public tenders → direct signed contracts.',
      targetValue: 10,
      unit: 'contracts',
      ownerId: beza.id,
    },
    {
      title: 'O-BZ1.6 — Presales meeting cadence',
      description: '240 staff-level + 100 C-level sessions (340 total).',
      targetValue: 340,
      unit: 'meetings',
      ownerId: beza.id,
    },
    {
      title: 'O-BZ1.7 — Certifications & internal workshops',
      description: '3 advanced certifications + 4 internal Tech-for-Sales workshops.',
      targetValue: 7,
      unit: 'milestones',
      ownerId: beza.id,
    },
  ])

  console.log('Imported 360Ground FY2026 OKRs.')
  console.log(`Timeframe: ${TF_NAME}`)
  console.log('CEO login: biruk@360ground.com / admin123')
  console.log('Beza login: beza@360ground.com / admin123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
