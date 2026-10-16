#!/usr/bin/env -S npx tsx
/**
 * Link the FY 2026/27 sales KPIs to the Odoo CRM sync (lib/integrations/odoo-sales).
 *
 *   ODOO_WON       EDN-K01, YOG-K01, YAR-K01, CEO-K02 (quota: cumulative credited won)
 *   ODOO_COVERAGE  EDN-K02 → EDN-K01, YOG-K02 → YOG-K01, YAR-K02 → YAR-K01, CEO-K07 → CEO-K02
 *   ODOO_PACE      CEO-K01 (company won ÷ pace, %), linked to the company KR that holds
 *                  the ETB target and pace checkpoints (default externalRef KR1.1)
 *
 * Matches KPIs by `externalRef` inside the timeframe (default: the active timeframe
 * named "FY 2026/27"; override with --timeframe-id). Dry run by default; --apply
 * writes. Idempotent: a KPI already linked is reported as unchanged. Each change
 * writes an ActivityLog row (entityType KPI, metadata.source = 'link-odoo-sales-kpis').
 *
 * Self-contained: plain PrismaClient, no '@/' imports, so it runs on the VPS from
 * the app root without a build.
 *
 * Usage (from the app root):
 *   npx tsx scripts/link-odoo-sales-kpis.ts                 # dry run
 *   npx tsx scripts/link-odoo-sales-kpis.ts --apply
 * Options:
 *   --timeframe-id <id>     timeframe to link in
 *   --company-kr <ref>      company KR externalRef for ODOO_PACE (default KR1.1)
 *   --actor-email <email>   ActivityLog actor (default: none — a system change)
 */
import { PrismaClient, type Prisma } from '@prisma/client'

const QUOTAS = ['EDN-K01', 'YOG-K01', 'YAR-K01', 'CEO-K02'] as const
const COVERAGE: Record<string, (typeof QUOTAS)[number]> = {
  'EDN-K02': 'EDN-K01',
  'YOG-K02': 'YOG-K01',
  'YAR-K02': 'YAR-K01',
  'CEO-K07': 'CEO-K02',
}
const COMPANY = 'CEO-K01'

interface Args {
  apply: boolean
  timeframeId: string | null
  companyKr: string
  actorEmail: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, timeframeId: null, companyKr: 'KR1.1', actorEmail: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') args.apply = true
    else if (a === '--timeframe-id') args.timeframeId = argv[++i] ?? null
    else if (a === '--company-kr') args.companyKr = argv[++i] ?? args.companyKr
    else if (a === '--actor-email') args.actorEmail = argv[++i] ?? null
    else throw new Error(`Unknown argument ${a}`)
  }
  return args
}

interface Plan {
  ref: string
  owner: string
  kpiId: string
  field: 'externalSource' | 'coverageOfKpiId' | 'keyResultId'
  from: string | null
  to: string
  /** Human form of `to` for the table. */
  toLabel: string
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const prisma = new PrismaClient()
  try {
    const timeframe = args.timeframeId
      ? await prisma.timeframe.findUnique({ where: { id: args.timeframeId } })
      : (await prisma.timeframe.findMany({ where: { isActive: true } })).find((t) => t.name.replace(/\s+/g, '') === 'FY2026/27') ??
        null
    if (!timeframe) throw new Error('Timeframe not found (pass --timeframe-id, or flag "FY 2026/27" active)')
    console.log(`Timeframe: ${timeframe.name} (${timeframe.id}) ${timeframe.startDate.toISOString().slice(0, 10)} → ${timeframe.endDate.toISOString().slice(0, 10)}`)

    const refs = [...QUOTAS, ...Object.keys(COVERAGE), COMPANY]
    const kpis = await prisma.kpi.findMany({
      where: { timeframeId: timeframe.id, externalRef: { in: refs } },
      select: { id: true, externalRef: true, name: true, status: true, externalSource: true, coverageOfKpiId: true, keyResultId: true, ownerId: true, owner: { select: { email: true } } },
    })
    const errors: string[] = []
    const byRef = new Map<string, (typeof kpis)[number]>()
    for (const ref of refs) {
      const rows = kpis.filter((k) => k.externalRef === ref)
      if (rows.length !== 1) errors.push(`${ref}: expected exactly one KPI in the timeframe, found ${rows.length}`)
      else if (rows[0].status !== 'ACTIVE') errors.push(`${ref}: KPI is ${rows[0].status}`)
      else byRef.set(ref, rows[0])
    }

    const plans: Plan[] = []
    const want = (ref: string, field: Plan['field'], to: string, toLabel: string) => {
      const kpi = byRef.get(ref)
      if (!kpi) return
      const from = kpi[field]
      if (from === to) return
      if (field === 'keyResultId' && from) {
        errors.push(`${ref}: already linked to another key result (${from}); unlink it first`)
        return
      }
      plans.push({ ref, owner: kpi.owner.email, kpiId: kpi.id, field, from, to, toLabel })
    }

    for (const ref of QUOTAS) want(ref, 'externalSource', 'ODOO_WON', 'ODOO_WON')
    for (const [ref, quotaRef] of Object.entries(COVERAGE)) {
      want(ref, 'externalSource', 'ODOO_COVERAGE', 'ODOO_COVERAGE')
      const quota = byRef.get(quotaRef)
      if (quota) want(ref, 'coverageOfKpiId', quota.id, quotaRef)
    }

    want(COMPANY, 'externalSource', 'ODOO_PACE', 'ODOO_PACE')
    const companyKrs = await prisma.keyResult.findMany({
      where: { externalRef: args.companyKr, status: 'ACTIVE', objective: { timeframeId: timeframe.id, level: 'COMPANY' } },
      select: { id: true, unit: true, targetValue: true, _count: { select: { checkpoints: true } } },
    })
    if (companyKrs.length !== 1) errors.push(`${COMPANY}: expected one active company KR ${args.companyKr}, found ${companyKrs.length}`)
    else {
      const kr = companyKrs[0]
      console.log(`Company KR ${args.companyKr}: target ${kr.targetValue} ${kr.unit}, ${kr._count.checkpoints} checkpoints`)
      want(COMPANY, 'keyResultId', kr.id, `KR ${args.companyKr}`)
    }

    if (plans.length === 0) console.log('\nNothing to change — every KPI is already linked.')
    else {
      console.log(`\n${args.apply ? 'Changes' : 'Planned changes (dry run)'}:`)
      console.table(plans.map((p) => ({ kpi: p.ref, owner: p.owner, field: p.field, from: p.from ?? '—', to: p.toLabel })))
    }
    if (errors.length) {
      console.error('\nProblems:')
      for (const e of errors) console.error(`  - ${e}`)
    }
    if (!args.apply) {
      console.log('\nDry run — re-run with --apply to write.')
      return
    }
    if (errors.length) {
      process.exitCode = 1
      console.error('\nNot applied: fix the problems above first.')
      return
    }
    if (plans.length === 0) return

    const actor = args.actorEmail ? await prisma.user.findUnique({ where: { email: args.actorEmail }, select: { id: true } }) : null
    if (args.actorEmail && !actor) throw new Error(`Actor ${args.actorEmail} not found`)
    await prisma.$transaction(async (tx) => {
      const grouped = new Map<string, Plan[]>()
      for (const p of plans) grouped.set(p.kpiId, [...(grouped.get(p.kpiId) ?? []), p])
      for (const [kpiId, list] of grouped) {
        const data: Prisma.KpiUncheckedUpdateInput = {}
        const changes: Record<string, { from: string | null; to: string }> = {}
        for (const p of list) {
          ;(data as Record<string, unknown>)[p.field] = p.to
          changes[p.field] = { from: p.from, to: p.to }
        }
        const kpi = await tx.kpi.update({ where: { id: kpiId }, data, select: { ownerId: true, timeframeId: true, packageId: true } })
        await tx.activityLog.create({
          data: {
            entityType: 'KPI',
            action: 'UPDATED',
            actorId: actor?.id ?? null,
            changes: changes as Prisma.InputJsonValue,
            metadata: {
              entityId: kpiId,
              userId: kpi.ownerId,
              timeframeId: kpi.timeframeId,
              ...(kpi.packageId ? { packageId: kpi.packageId } : {}),
              source: 'link-odoo-sales-kpis',
            } as Prisma.InputJsonValue,
          },
        })
      }
    })
    console.log(`\nApplied ${plans.length} change(s) on ${new Set(plans.map((p) => p.kpiId)).size} KPI(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
