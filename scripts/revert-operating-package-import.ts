#!/usr/bin/env -S npx tsx
/**
 * Revert the Employee Operating Package import for one timeframe (default "FY 2026/27"), so it can
 * be re-imported from new workbooks with scripts/import-operating-packages.ts.
 *
 * Removes everything the importer created for the timeframe:
 *   objectives with an externalRef (COMPANY + INDIVIDUAL) → their KRs, checkpoints, check-ins,
 *   comments, views, risks, retrospectives, scrum links, metric-source mappings (FK cascade);
 *   to-dos the importer made (milestones, tasks, duty heads) + their recurrence occurrences + members,
 *   labels, checklists, attachments, comments, initiative updates;
 *   operating packages (+ item reviews), recurring duties (+ collaborators), role definitions
 *   (+ items), KPIs (+ readings), development items, work dependencies (+ parties, links), decisions
 *   (+ links); OKR links (CONTRIBUTES_TO / SUCCEEDS) touching a removed item; notifications and
 *   unsent digest rows about removed rows; watchers / favorites / confidence snapshots on them.
 * Keeps: the Timeframe row (and isActive), every other timeframe, objectives in the timeframe that
 * were made in the UI (externalRef null — unless --include-manual-objectives), and to-dos people
 * made in the UI on a removed KR / objective (detached: keyResultId / objectiveId → null).
 * ActivityLog rows with an FK to a removed objective / KR / to-do cascade (the FKs are ON DELETE
 * CASCADE); the ones not written by the importer are copied into the snapshot first. Package-module
 * audit rows (no FK, metadata.entityId) are kept.
 *
 * Before deleting, a snapshot JSON of the user-generated activity on the doomed rows (check-ins,
 * progress, completed to-dos and duty occurrences, KPI readings, comments, attachments, reviews,
 * decisions, dependency status, initiative updates, …) plus the full id manifest is written.
 *
 * All writes happen in one transaction (rolled back on any error, including the post-delete check
 * that every simulated row is gone). Idempotent: a second --apply finds nothing and writes nothing.
 *
 * Self-contained: plain PrismaClient, relative imports only (no '@/'), runs on the VPS from the app root.
 *
 * Usage (from the app root):
 *   npx tsx scripts/revert-operating-package-import.ts                       # dry run (default)
 *   npx tsx scripts/revert-operating-package-import.ts --apply --snapshot /root/backups/opk-revert-snapshot.json
 * Options:
 *   --timeframe <name>             timeframe name (default "FY 2026/27")
 *   --timeframe-id <id>            timeframe id (overrides the name)
 *   --snapshot <path>              snapshot JSON (default ./operating-package-revert-snapshot-<UTC stamp>.json)
 *   --report <path>                write the JSON report (counts, FK audit, detaches, preserved to-dos)
 *   --actor-email <email>          ActivityLog actor for the summary row (default: none / system)
 *   --include-manual-objectives    also delete objectives in the timeframe that have no externalRef
 *   --apply                        delete; refuses while there are blockers
 */

import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { applyRevert, type ApplyResult } from './lib/operating-package-revert/apply'
import { collect, DEFAULT_TIMEFRAME_NAME, deleteCounts, type Collected } from './lib/operating-package-revert/collect'
import { defaultSnapshotName, manifestFingerprint } from './lib/operating-package-revert/plan'
import { buildSnapshot, snapshotHighlights } from './lib/operating-package-revert/snapshot'

export interface CliArgs {
  apply: boolean
  timeframeName: string
  timeframeId: string | null
  snapshot: string | null
  report: string | null
  actorEmail: string | null
  includeManualObjectives: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    timeframeName: DEFAULT_TIMEFRAME_NAME,
    timeframeId: null,
    snapshot: null,
    report: null,
    actorEmail: null,
    includeManualObjectives: false,
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
      case '--include-manual-objectives':
        args.includeManualObjectives = true
        break
      case '--timeframe':
        args.timeframeName = value(i, a)
        i++
        break
      case '--timeframe-id':
        args.timeframeId = value(i, a)
        i++
        break
      case '--snapshot':
        args.snapshot = value(i, a)
        i++
        break
      case '--report':
        args.report = value(i, a)
        i++
        break
      case '--actor-email':
        args.actorEmail = value(i, a)
        i++
        break
      case '--help':
      case '-h':
        throw new Error('help')
      default:
        throw new Error(`Unknown argument ${a}`)
    }
  }
  return args
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

function fingerprint(c: Collected): string {
  return manifestFingerprint({
    ...Object.fromEntries(Object.entries(c.doomed).map(([k, v]) => [`doomed:${k}`, v])),
    ...Object.fromEntries(Object.entries(c.polymorphic).map(([k, v]) => [`poly:${k}`, v])),
    preserved: c.preservedTodos.map((t) => t.id),
  })
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const fd = fs.openSync(file, 'w')
  try {
    fs.writeSync(fd, `${JSON.stringify(data, null, 2)}\n`)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function printPlan(c: Collected, counts: Record<string, number>) {
  console.log(`Timeframe: ${c.timeframe.name} (${c.timeframe.id}) isActive=${c.timeframe.isActive} — the row itself is kept`)
  console.log('')
  console.log(`${pad('Rows removed (table)', 40)} count`)
  for (const [t, n] of Object.entries(counts)) console.log(`${pad(t, 40)} ${n}`)
  const reasons: Record<string, number> = {}
  for (const r of Object.values(c.todoReasons)) reasons[r] = (reasons[r] ?? 0) + 1
  console.log(`\nImporter to-dos by reason: ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`)
  console.log(`\nPerson-made to-dos kept and detached: ${c.preservedTodos.length}`)
  for (const t of c.preservedTodos) console.log(`  - ${t.id} "${t.title}" [${t.status}] assignee ${t.assignee ?? '-'} · creator ${t.creator ?? '-'} · kr ${t.keyResultId ?? '-'} · obj ${t.objectiveId ?? '-'}`)
  if (c.manualObjectives.length) {
    console.log(`\nObjectives in the timeframe without externalRef: ${c.manualObjectives.length}`)
    for (const o of c.manualObjectives) console.log(`  - ${o.id} "${o.title}" (${o.level}, ${o.owner ?? '-'}) ${o.included ? 'DELETED' : 'kept'}`)
  }
  const fkDet = Object.entries(c.fkDetached)
  console.log(`\nFK SET NULL detaches (rows kept): ${fkDet.length ? fkDet.map(([k, v]) => `${k} ${v.length}`).join(' · ') : 'none'}`)
  console.log(`Column detaches (no FK, set null): ${c.columnDetaches.length ? c.columnDetaches.map((d) => `${d.table}.${d.column} ${d.ids.length}`).join(' · ') : 'none'}`)
  console.log(`ActivityLog rows without FK that mention a removed id (kept): ${c.metadataOnlyActivityLogs}`)
  console.log(`Already-sent digest rows about removed rows (kept as history): ${c.sentDigestRowsKept}`)
  console.log('\nFK audit (references from rows outside the roots):')
  for (const r of c.fkAudit) console.log(`  ${pad(`${r.table}.${r.column}`, 44)} → ${pad(r.refTable, 20)} ${pad(r.disposition, 9)} ${pad(String(r.rows), 6)} ${r.handledBy ?? ''}`)
  if (c.warnings.length) {
    console.log(`\nWarnings (${c.warnings.length}):`)
    for (const w of c.warnings) console.log(`  - ${w}`)
  }
  if (c.blockers.length) {
    console.log(`\nBLOCKERS (${c.blockers.length}):`)
    for (const b of c.blockers) console.log(`  - ${b}`)
  }
}

export async function run(argv: string[]): Promise<number> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    const msg = (err as Error).message
    if (msg !== 'help') console.error(msg)
    console.error(
      'Usage: npx tsx scripts/revert-operating-package-import.ts [--dry-run|--apply] [--timeframe <name>] [--timeframe-id <id>] [--snapshot <json>] [--report <json>] [--actor-email <email>] [--include-manual-objectives]',
    )
    return msg === 'help' ? 0 : 2
  }

  const now = new Date()
  const snapshotPath = path.resolve(args.snapshot ?? defaultSnapshotName(now))
  const opts = { timeframeId: args.timeframeId, timeframeName: args.timeframeName, includeManualObjectives: args.includeManualObjectives }
  const prisma = new PrismaClient()
  try {
    let actorId: string | null = null
    if (args.actorEmail) {
      const actor = await prisma.user.findUnique({ where: { email: args.actorEmail }, select: { id: true } })
      if (!actor) throw new Error(`--actor-email ${args.actorEmail}: no such user`)
      actorId = actor.id
    }

    const planned = await collect(prisma, opts)
    const counts = deleteCounts(planned)
    console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} — revert operating-package import`)
    printPlan(planned, counts)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)

    let applied: ApplyResult | null = null
    let snapshotWritten: string | null = null
    if (total === 0 && planned.preservedTodos.length === 0 && planned.columnDetaches.length === 0) {
      console.log('\nNothing to revert — the timeframe holds no imported rows.')
    } else {
      const snapshot = await buildSnapshot(prisma, planned, { generatedAt: now, mode: args.apply ? 'apply' : 'dry-run' })
      writeJson(snapshotPath, snapshot)
      snapshotWritten = snapshotPath
      console.log(`\nSnapshot written: ${snapshotPath}`)
      const hi = snapshotHighlights(snapshot)
      console.log(`User-generated activity in the snapshot: ${hi.length ? hi.join(' · ') : 'none'}`)

      if (args.apply) {
        if (planned.blockers.length) {
          console.log('\nRefused: resolve the blockers above first. Nothing was written.')
          return 1
        }
        const expected = fingerprint(planned)
        applied = await prisma.$transaction(
          async (tx) => {
            const fresh = await collect(tx, opts)
            if (fingerprint(fresh) !== expected || fresh.blockers.length) {
              throw new Error('The data changed between the plan and the transaction (or a blocker appeared) — nothing was written; re-run.')
            }
            return applyRevert(tx, fresh, { actorId, snapshotPath, counts })
          },
          { maxWait: 30_000, timeout: 20 * 60_000 },
        )
        console.log('\nApplied (one transaction, committed):')
        console.log(`  person-made to-dos detached: ${applied.detachedTodos}`)
        for (const [k, v] of Object.entries(applied.columnDetaches)) console.log(`  column detach ${k}: ${v}`)
        for (const [k, v] of Object.entries(applied.polymorphicDeleted)) console.log(`  deleted ${k}: ${v}`)
        for (const [k, v] of Object.entries(applied.rootDeleted)) console.log(`  deleted ${k} (roots, + cascades): ${v}`)
        console.log(`  verified gone in ${applied.verifiedTables} table(s); summary ActivityLog ${applied.summaryActivityId ?? '-'}`)
      } else {
        console.log('\nDry run — nothing was written. Re-run with --apply to delete.')
      }
    }

    if (args.report) {
      const out = path.resolve(args.report)
      writeJson(out, {
        generatedAt: now.toISOString(),
        mode: args.apply ? 'apply' : 'dry-run',
        timeframe: planned.timeframe,
        counts,
        roots: Object.fromEntries(Object.entries(planned.roots).map(([k, v]) => [k, v.length])),
        todoReasons: planned.todoReasons,
        preservedTodos: planned.preservedTodos,
        manualObjectives: planned.manualObjectives,
        fkAudit: planned.fkAudit,
        fkDetached: planned.fkDetached,
        columnDetaches: planned.columnDetaches,
        metadataOnlyActivityLogsKept: planned.metadataOnlyActivityLogs,
        sentDigestRowsKept: planned.sentDigestRowsKept,
        warnings: planned.warnings,
        blockers: planned.blockers,
        snapshot: snapshotWritten,
        applied,
      })
      console.log(`Report written: ${out}`)
    }
    return planned.blockers.length && args.apply ? 1 : 0
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && /revert-operating-package-import\.ts$/.test(process.argv[1])) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
