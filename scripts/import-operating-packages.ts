#!/usr/bin/env -S npx tsx
/**
 * Import the FY 2026/27 Employee Operating Packages (IMP-1 … IMP-6).
 *
 * Source: the Company OKR workbook and the nine Operating Package workbooks in --dir
 * (docs/employee_operating_package_REQUIREMENTS.md §7). Both the v1 names
 * ("360Ground-Company-OKR-FY2026-27-v4.xlsx", "Eden-Operating-Package-FY2026-27-v2.xlsx") and the v2
 * names of 27 Oct 2026 ("360Ground Company OKR FY2026 27 v6 (1).xlsx", "Eden Operating Package FY2026
 * 27 v4 (1).xlsx") are recognised; the highest version of each wins.
 *
 * What it writes (create or update on externalRef — never deletes):
 *   timeframe "FY 2026/27" (YEARLY 2026-07-07 … 2027-07-06, inactive) when missing
 *   → company objectives (COMPANY) + KRs + Q2/Q3/Q4 checkpoints
 *   → per package: OperatingPackage header (DRAFT), objectives (INDIVIDUAL, parent = the company
 *     objective of the first linked company KR, LOOSE) + KRs (C/A, baseline/target text, measured
 *     by, due; one figure picked from v2 targets such as "≥200 (45 by 31 Dec · 115 by 31 Mar)"),
 *     v2 initiatives (Todo kind=INITIATIVE on the KR named in "Supports", or none for KPI /
 *     Development Plan initiatives), milestones (Todo kind=MILESTONE, on the parent KR or the parent
 *     initiative's KR; 100/n each on the package's own milestone-scored KRs), tasks (Todo
 *     kind=TASK + collaborators), recurring duties (+ collaborators, + the Todo recurrence head per
 *     DUT-1), role definition (DRAFT) + items, KPIs, development items (mandatory)
 *   → CONTRIBUTES_TO links (individual objective/KR → company KR, plus company "Lands in")
 *   → company Dependency Map + package X-links → WorkDependency (+ parties, + linked items)
 *   → decisions (CEO Decision Log ∪ "Decisions for the CEO") + decision links
 *   → Agree / Dispute review cells → PackageItemReview
 *   → FY25/26 carry-forward SUCCEEDS links (new → old, old matched by upper(right(id, 6)); an
 *     initiative new home links its supported KR as non-primary, an initiative group is skipped)
 * Every create / update writes an ActivityLog row with metadata.source = 'import'.
 *
 * Self-contained: plain PrismaClient, relative imports only (no '@/'), so it runs on the VPS from
 * the app root without a build.
 *
 * Usage (from the app root):
 *   npx tsx scripts/import-operating-packages.ts --review-out /tmp/opk-review.xlsx      # dry run
 *   npx tsx scripts/import-operating-packages.ts --apply [--review-out <file>]          # write
 * Options:
 *   --dir <path>            workbook folder (default: data-import, looked up in ./, ../, ../../)
 *   --user-map <path>       name → user overrides (default: scripts/data/operating-package-user-map.json)
 *   --review-out <path>     write the review workbook (.xlsx); default for a dry run:
 *                           ./operating-package-import-review.xlsx
 *   --actor-email <email>   ActivityLog actor / link creator (default: the user matched as "CEO")
 *   --old-timeframe-id <id> FY25/26 timeframe for carry-forward matching (default: the most common
 *                           timeframe among the matched codes)
 *   --notify                one in-app "package ready for review" notification per employee
 *   --apply                 write; refuses while any owner name is unmatched
 */

import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { runImport } from './lib/operating-package-import/importer'
import { resolveDataDir } from './lib/operating-package-import/parse'

export const DEFAULT_USER_MAP = path.join('scripts', 'data', 'operating-package-user-map.json')
export const DEFAULT_REVIEW_OUT = 'operating-package-import-review.xlsx'

export interface CliArgs {
  apply: boolean
  dir: string | null
  userMap: string
  reviewOut: string | null
  actorEmail: string | null
  oldTimeframeId: string | null
  notify: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    dir: null,
    userMap: DEFAULT_USER_MAP,
    reviewOut: null,
    actorEmail: null,
    oldTimeframeId: null,
    notify: false,
  }
  const value = (i: number, flag: string) => {
    const v = argv[i + 1]
    if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--apply':
        args.apply = true
        break
      case '--dry-run':
        args.apply = false
        break
      case '--notify':
        args.notify = true
        break
      case '--dir':
        args.dir = value(i, a)
        i++
        break
      case '--user-map':
        args.userMap = value(i, a)
        i++
        break
      case '--review-out':
        args.reviewOut = value(i, a)
        i++
        break
      case '--actor-email':
        args.actorEmail = value(i, a)
        i++
        break
      case '--old-timeframe-id':
        args.oldTimeframeId = value(i, a)
        i++
        break
      case '--help':
      case '-h':
        throw new Error('help')
      default:
        throw new Error(`Unknown argument ${a}`)
    }
  }
  if (!args.apply && !args.reviewOut) args.reviewOut = DEFAULT_REVIEW_OUT
  return args
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

export async function main(argv: string[]): Promise<number> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    const msg = (err as Error).message
    if (msg !== 'help') console.error(msg)
    console.error('Usage: npx tsx scripts/import-operating-packages.ts [--apply] [--review-out <xlsx>] [--dir <path>] [--user-map <json>] [--actor-email <email>] [--old-timeframe-id <id>] [--notify]')
    return msg === 'help' ? 0 : 2
  }

  const prisma = new PrismaClient()
  try {
    const result = await runImport(prisma, {
      apply: args.apply,
      dataDir: resolveDataDir(args.dir),
      userMapPath: path.resolve(args.userMap),
      reviewOut: args.reviewOut ? path.resolve(args.reviewOut) : null,
      actorEmail: args.actorEmail,
      notify: args.notify,
      oldTimeframeId: args.oldTimeframeId,
    })

    console.log('')
    console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} — operating packages ${result.blocked ? '(BLOCKED — nothing written)' : ''}`)
    console.log(`${pad('Entity', 34)} ${pad('create', 7)} ${pad('update', 7)} ${pad('same', 7)} skip`)
    for (const [entity, c] of result.counters.entries()) {
      console.log(`${pad(entity, 34)} ${pad(String(c.create), 7)} ${pad(String(c.update), 7)} ${pad(String(c.unchanged), 7)} ${c.skip}`)
    }
    if (args.apply) console.log(`ActivityLog rows written: ${result.activityRows}`)
    if (result.warnings.length) {
      console.log(`\nWarnings (${result.warnings.length}):`)
      for (const w of result.warnings.slice(0, 40)) console.log(`  - ${w}`)
      if (result.warnings.length > 40) console.log(`  … ${result.warnings.length - 40} more in the review workbook`)
    }
    if (result.blockers.length) {
      console.log(`\n${args.apply ? 'Refused' : 'Would refuse --apply'}: ${result.blockers.length} blocker(s)`)
      for (const b of result.blockers) console.log(`  - ${b}`)
      console.log(`Fix the names in ${args.userMap} (or pass --user-map) and re-run.`)
    }
    if (result.reviewPath) console.log(`\nReview workbook: ${result.reviewPath}`)
    return result.blocked ? 1 : 0
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && /import-operating-packages\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
