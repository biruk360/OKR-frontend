/**
 * A8 — Seed the eight role scorecard templates from the source Excel workbooks
 * (Engineering Team Scorecard v1.xlsx + Sales_Engineering_OKR_Scorecard 2025-2026 OKR.xlsx),
 * pre-parsed into performance-templates-seed.json.
 *
 * Idempotent: a family whose name already exists is skipped, so re-running the
 * script never duplicates or overwrites HR's edits. Each template is created as
 * version 1 and PUBLISHED after passing the app's own publish validation.
 *
 * The SE OKR template's automatic metric criteria are seeded with their scoring
 * rules; Key Result links are per-employee (MetricSourceMapping) and left for HR
 * to wire up — cycle opening flags them as METRIC_SOURCE_MISSING until mapped.
 *
 * Run: npm run db:seed:performance
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { validateTemplateForPublish } from '../lib/performance/template-validation'

const prisma = new PrismaClient()

type SeedCriterion = {
  type: 'RUBRIC' | 'METRIC'
  code: string | null
  title: string
  maxPoints: number
  anchorJson?: Record<string, string>
  unit?: string | null
  periodLabel?: string | null
  target?: number | null
  scoringRuleJson?: Record<string, unknown>
}

type SeedTemplate = {
  familyName: string
  roleLabel: string
  gatekeeper: { tierName: string; threshold: number; failureBand: string }
  bands: Array<{ min: number; label: string }>
  tiers: Array<{ name: string; maxPoints: number; criteria: SeedCriterion[] }>
}

async function main() {
  const payload = JSON.parse(
    readFileSync(join(__dirname, 'performance-templates-seed.json'), 'utf8'),
  ) as { templates: SeedTemplate[] }

  const author = await prisma.user.findFirst({
    where: { isActive: true, role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  })
  if (!author) throw new Error('No active ADMIN user found to own the seeded templates')
  console.log(`Seeding as ${author.email}`)

  for (const template of payload.templates) {
    const existing = await prisma.scorecardTemplateFamily.findUnique({
      where: { name: template.familyName },
      select: { id: true },
    })
    if (existing) {
      console.log(`SKIP  ${template.familyName} (family already exists)`)
      continue
    }

    const issues = validateTemplateForPublish({
      gatekeeperJson: template.gatekeeper as unknown as Prisma.JsonValue,
      bandsJson: template.bands as unknown as Prisma.JsonValue,
      tiers: template.tiers.map((tier) => ({
        name: tier.name,
        maxPoints: tier.maxPoints,
        criteria: tier.criteria.map((criterion) => ({
          type: criterion.type,
          title: criterion.title,
          maxPoints: criterion.maxPoints,
          anchorJson: (criterion.anchorJson ?? null) as Prisma.JsonValue,
          target: criterion.target ?? null,
          scoringRuleJson: (criterion.scoringRuleJson ?? null) as Prisma.JsonValue,
        })),
      })),
    })
    if (issues.length > 0) {
      throw new Error(`${template.familyName} fails publish validation:\n` + issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n'))
    }

    const maxTotal = template.tiers.reduce((sum, tier) => sum + tier.maxPoints, 0)
    await prisma.$transaction(async (tx) => {
      const family = await tx.scorecardTemplateFamily.create({
        data: { name: template.familyName, roleLabel: template.roleLabel, createdById: author.id },
      })
      const created = await tx.scorecardTemplate.create({
        data: {
          familyId: family.id,
          version: 1,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          maxTotal,
          gatekeeperJson: template.gatekeeper as unknown as Prisma.InputJsonValue,
          bandsJson: template.bands as unknown as Prisma.InputJsonValue,
          createdById: author.id,
        },
      })
      for (const [tierIndex, tier] of template.tiers.entries()) {
        const createdTier = await tx.scorecardTier.create({
          data: { templateId: created.id, name: tier.name, position: tierIndex, maxPoints: tier.maxPoints },
        })
        for (const [criterionIndex, criterion] of tier.criteria.entries()) {
          await tx.scorecardCriterion.create({
            data: {
              tierId: createdTier.id,
              type: criterion.type,
              code: criterion.code,
              title: criterion.title,
              position: criterionIndex,
              maxPoints: criterion.maxPoints,
              anchorJson: (criterion.anchorJson ?? undefined) as Prisma.InputJsonValue | undefined,
              unit: criterion.unit ?? undefined,
              periodLabel: criterion.periodLabel ?? undefined,
              target: criterion.target ?? undefined,
              scoringRuleJson: (criterion.scoringRuleJson ?? undefined) as Prisma.InputJsonValue | undefined,
            },
          })
        }
      }
    })
    console.log(`SEED  ${template.familyName} — v1 PUBLISHED, ${template.tiers.length} tiers, maxTotal ${maxTotal}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
