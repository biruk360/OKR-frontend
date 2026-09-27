/**
 * Move legacy project activity attachments out of
 * `public/uploads/project-activities/` into the private PROJECT_UPLOAD_ROOT,
 * and point each row at the authenticated route.
 *
 * Mirrors scripts/migrate-todo-attachments-private.ts. Before the fix,
 * activity uploads were written under public/, which Next serves statically
 * with no session check (stored XSS + read-by-URL, INTERNAL files included).
 * New uploads go to the private root already, and middleware 404s the static
 * path; this closes it at the source by moving the bytes.
 *
 * For every ActivityAttachment whose `storagePath` starts with
 * `/uploads/project-activities/`:
 *   - resolve the legacy file with the same contained resolver the GET route
 *     uses (a doctored path is SKIPPED, never followed);
 *   - copy it to `<PROJECT_UPLOAD_ROOT>/<row id>`, verify the byte count,
 *     update `storagePath` to
 *     `/api/projects/<projectId>/activities/<activityId>/attachments/<id>`,
 *     then remove the public copy. A row whose file is missing is REPORTED and
 *     left alone.
 *   - the row's recorded `mimeType` is re-checked against the allowlist
 *     (serveTypeFor) and reported; it is not rewritten — the GET route already
 *     serves an unverifiable file as an opaque download.
 * Visibility is never touched.
 *
 * Also lists files in public/uploads/project-activities/ that no row
 * references (orphans); they are reported, not moved or deleted.
 *
 * Dry-run by default: prints what it would do and writes nothing.
 *
 * Usage:
 *   # Preview (default):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/migrate-project-attachments-private.ts
 *   # Apply:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/migrate-project-attachments-private.ts --apply
 *
 * Run it on the host that holds the files (prod: the VPS app dir), with the
 * same PROJECT_UPLOAD_DIR (if any) the app runs with.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-7 [A], A3;
 *       docs/attachment_viewer_REQUIREMENTS.md A1.
 */

import { copyFile, mkdir, readFile, readdir, stat, unlink } from 'fs/promises'
import { prisma } from '../lib/prisma'
import {
  LEGACY_PROJECT_PUBLIC_ROOT,
  LEGACY_PROJECT_URL_PREFIX,
  PROJECT_UPLOAD_ROOT,
  projectAttachmentApiUrl,
  resolveProjectAttachmentPath,
} from '../lib/attachments/project-storage'
import { resolveInside } from '../lib/attachments/storage'
import { serveTypeFor } from '../lib/attachments/serve'

const APPLY = process.argv.includes('--apply')
const TAG = '[migrate-project-attachments]'

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log(`${TAG} mode: ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply to write)'}`)
  console.log(`${TAG} legacy root:  ${LEGACY_PROJECT_PUBLIC_ROOT}`)
  console.log(`${TAG} private root: ${PROJECT_UPLOAD_ROOT}`)

  const raw = await prisma.activityAttachment.findMany({
    select: {
      id: true, activityId: true, storagePath: true, fileName: true, mimeType: true, visibility: true,
      activity: { select: { milestone: { select: { phase: { select: { projectId: true } } } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const rows = raw.map(({ activity, ...r }) => ({ ...r, projectId: activity.milestone.phase.projectId }))
  const legacy = rows.filter((r) => r.storagePath.startsWith(LEGACY_PROJECT_URL_PREFIX))
  const alreadyPrivate = rows.filter((r) => resolveProjectAttachmentPath(r)?.kind === 'private')
  const other = rows.length - legacy.length - alreadyPrivate.length
  console.log(
    `${TAG} rows: ${rows.length} total, ${legacy.length} legacy, ` +
    `${alreadyPrivate.length} already private, ${other} unrecognised storagePath`,
  )

  const counts = { moved: 0, wouldMove: 0, missing: 0, skipped: 0, unverifiedType: 0, failed: 0 }
  const referenced = new Set<string>()

  for (const row of legacy) {
    const from = resolveProjectAttachmentPath(row)
    const tag = `${row.id} (project ${row.projectId}, activity ${row.activityId}, ${row.visibility}) "${row.fileName}"`
    if (!from || from.kind !== 'legacy') {
      console.log(`  SKIP     ${tag}: storagePath ${JSON.stringify(row.storagePath)} does not resolve inside the legacy root`)
      counts.skipped++
      continue
    }
    referenced.add(from.path)
    if (!(await exists(from.path))) {
      console.log(`  MISSING  ${tag}: ${from.path} not on disk — row left unchanged`)
      counts.missing++
      continue
    }

    let to: string
    try {
      to = resolveInside(PROJECT_UPLOAD_ROOT, row.id)
    } catch {
      console.log(`  SKIP     ${tag}: id is not a safe file name`)
      counts.skipped++
      continue
    }
    const newPath = projectAttachmentApiUrl(row.projectId, row.activityId, row.id)

    const bytes = await readFile(from.path)
    const type = serveTypeFor({ filename: row.fileName, mimeType: row.mimeType, bytes: new Uint8Array(bytes) })
    const typeNote = type ? `served as ${type.mime}` : `UNVERIFIED (recorded ${row.mimeType || '∅'}) — served as download`
    if (!type) counts.unverifiedType++

    if (!APPLY) {
      console.log(`  MOVE     ${tag}: ${from.path} -> ${to}; storagePath -> ${newPath}; ${typeNote}`)
      counts.wouldMove++
      continue
    }

    try {
      await mkdir(PROJECT_UPLOAD_ROOT, { recursive: true })
      await copyFile(from.path, to)
      const copied = await stat(to)
      if (copied.size !== bytes.byteLength) throw new Error(`size mismatch after copy (${copied.size} vs ${bytes.byteLength})`)
      // Only rewrite if the row still points at the legacy file (idempotent, no lost update).
      const updated = await prisma.activityAttachment.updateMany({
        where: { id: row.id, storagePath: row.storagePath },
        data: { storagePath: newPath },
      })
      if (updated.count !== 1) throw new Error('row changed underneath us; left as is')
      await unlink(from.path)
      console.log(`  MOVED    ${tag}: -> ${to}; ${typeNote}`)
      counts.moved++
    } catch (err) {
      console.log(`  FAILED   ${tag}: ${err instanceof Error ? err.message : String(err)}`)
      counts.failed++
    }
  }

  // Orphans: files on disk no row references. Reported only.
  let orphans: string[] = []
  if (await exists(LEGACY_PROJECT_PUBLIC_ROOT)) {
    const names = await readdir(LEGACY_PROJECT_PUBLIC_ROOT)
    orphans = names
      .map((n) => {
        try { return resolveInside(LEGACY_PROJECT_PUBLIC_ROOT, n) } catch { return null }
      })
      .filter((p): p is string => !!p && !referenced.has(p))
  } else {
    console.log(`${TAG} ${LEGACY_PROJECT_PUBLIC_ROOT} does not exist on this host`)
  }
  for (const o of orphans) console.log(`  ORPHAN   ${o} (no row references it — not touched)`)

  console.log(
    `${TAG} summary: ` +
    (APPLY ? `moved ${counts.moved}, failed ${counts.failed}` : `would move ${counts.wouldMove}`) +
    `, missing ${counts.missing}, skipped ${counts.skipped}, unverified type ${counts.unverifiedType}, orphans ${orphans.length}`,
  )
}

main()
  .catch((err) => {
    console.error(`${TAG} failed:`, err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
