/**
 * ATT-4 — move card (to-do) comment attachments from the legacy
 * `TodoComment.commentAttachments` JSON onto `CommentAttachment` rows.
 *
 * For every TodoComment whose JSON lists attachment ids:
 *   - a comment that already has CommentAttachment rows (commentType 'TODO')
 *     is SKIPPED as migrated — reruns are no-ops;
 *   - each listed id is resolved against `TodoAttachment` on the SAME card
 *     (a foreign or deleted id is reported and ignored — it never rendered);
 *   - the bytes are located with the contained resolver the card route uses
 *     (`resolveTodoAttachmentPath`): the private root, or — if
 *     scripts/migrate-todo-attachments-private.ts has not run for that row —
 *     the legacy `public/uploads/todos/` file, which is read and copied like
 *     any other (reported as LEGACY-PUBLIC; the public copy is not touched);
 *   - the bytes are re-validated against the upload allowlist + magic bytes
 *     (`validateUpload`), because legacy uploads were never validated; the
 *     comment-attachment serve route only serves allowlisted types;
 *   - on --apply the bytes are COPIED into the comment upload root under a
 *     fresh server-generated name and the rows are created in one transaction
 *     (uploader, filename, createdAt carried over; image dimensions captured).
 *
 * All-or-nothing per comment: if any listed attachment is missing on disk,
 * unresolvable or fails validation, the comment is left alone and reported —
 * it keeps rendering from its JSON (the GET route reads the JSON only for
 * comments with no CommentAttachment rows), so nothing ever shows a half-set.
 *
 * Deliberately NOT done:
 *   - the JSON column is left in place, unread once rows exist — the
 *     one-release rollback path ATT-4 asks for;
 *   - the `TodoAttachment` rows and their files are left in place — they are
 *     also the card's own attachments (the card grid lists them).
 *
 * Dry-run by default: prints what it would do and writes nothing.
 *
 * Usage:
 *   # Preview (default; --dry-run is accepted and means the same):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/migrate-todo-comment-attachments.ts
 *   # Apply:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/migrate-todo-comment-attachments.ts --apply
 *
 * Run it on the host that holds the files (prod: the VPS app dir), with the
 * same UPLOAD_DIR / TODO_UPLOAD_DIR (if any) the app runs with. Best run after
 * scripts/migrate-todo-attachments-private.ts.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-4, ATT-AC-2, XCT-5.
 */

import { readFile } from 'fs/promises'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { resolveTodoAttachmentPath } from '../lib/attachments/todo-storage'
import { generateStoredName, persistFile, deleteFile, UPLOAD_ROOT } from '../lib/attachments/storage'
import { validateUpload, readImageDimensions } from '../lib/attachments/file-types'
import { parseLegacyAttachmentIds, TODO_COMMENT_TYPE } from '../lib/attachments/todo-comments'

const APPLY = process.argv.includes('--apply')
if (APPLY && process.argv.includes('--dry-run')) {
  console.error('[migrate-todo-comment-attachments] pass either --apply or --dry-run, not both')
  process.exit(2)
}

interface Prepared {
  attachmentId: string
  uploadedById: string
  filename: string
  createdAt: Date
  bytes: Buffer
  mime: string
  extension: string
  width: number | null
  height: number | null
  legacyPublic: boolean
}

async function main() {
  const tag0 = '[migrate-todo-comment-attachments]'
  console.log(`${tag0} mode: ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply to write)'}`)
  console.log(`${tag0} comment upload root: ${UPLOAD_ROOT}`)

  const comments = await prisma.todoComment.findMany({
    where: { commentAttachments: { not: null } },
    select: { id: true, todoId: true, commentAttachments: true },
    orderBy: { createdAt: 'asc' },
  })

  const counts = {
    comments: comments.length, empty: 0, alreadyMigrated: 0, migrated: 0, wouldMigrate: 0,
    blocked: 0, failed: 0, files: 0, legacyPublic: 0, danglingIds: 0,
  }

  for (const c of comments) {
    const ids = parseLegacyAttachmentIds(c.commentAttachments)
    const tag = `comment ${c.id} (todo ${c.todoId})`
    if (ids.length === 0) { counts.empty++; continue }

    const existing = await prisma.commentAttachment.count({
      where: { commentType: TODO_COMMENT_TYPE, commentId: c.id },
    })
    if (existing > 0) {
      console.log(`  SKIP     ${tag}: already has ${existing} CommentAttachment row(s)`)
      counts.alreadyMigrated++
      continue
    }

    const rows = await prisma.todoAttachment.findMany({
      where: { id: { in: ids }, todoId: c.todoId },
      select: { id: true, todoId: true, url: true, filename: true, mimeType: true, uploadedById: true, createdAt: true },
    })
    const byId = new Map(rows.map((r) => [r.id, r]))
    const dangling = ids.filter((id) => !byId.has(id))
    if (dangling.length > 0) {
      // Never rendered (hydration drops foreign/deleted ids), so dropping them loses nothing.
      console.log(`  NOTE     ${tag}: ${dangling.length} id(s) not on this card or deleted — ignored: ${dangling.join(', ')}`)
      counts.danglingIds += dangling.length
    }
    if (rows.length === 0) { counts.empty++; continue }

    const prepared: Prepared[] = []
    const problems: string[] = []
    for (const id of ids) {
      const row = byId.get(id)
      if (!row) continue
      const loc = resolveTodoAttachmentPath(row)
      if (!loc) { problems.push(`${row.id} "${row.filename}": url ${JSON.stringify(row.url)} is not a file we wrote`); continue }
      let bytes: Buffer
      try {
        bytes = await readFile(loc.path)
      } catch {
        problems.push(`${row.id} "${row.filename}": missing on disk (${loc.path})`)
        continue
      }
      const verdict = validateUpload({
        filename: row.filename,
        declaredMime: row.mimeType,
        size: bytes.byteLength,
        head: new Uint8Array(bytes.subarray(0, 64)),
      })
      if (!verdict.ok) { problems.push(`${row.id} "${row.filename}": ${verdict.reason} — ${verdict.message}`); continue }
      const dims = verdict.type.kind === 'IMAGE' ? readImageDimensions(new Uint8Array(bytes), verdict.type.mime) : null
      prepared.push({
        attachmentId: row.id, uploadedById: row.uploadedById, filename: row.filename.slice(0, 255),
        createdAt: row.createdAt, bytes, mime: verdict.type.mime, extension: verdict.extension,
        width: dims?.width ?? null, height: dims?.height ?? null, legacyPublic: loc.kind === 'legacy',
      })
    }

    if (problems.length > 0) {
      console.log(`  BLOCKED  ${tag}: left on its JSON (still renders from it):`)
      for (const p of problems) console.log(`             - ${p}`)
      counts.blocked++
      continue
    }

    const legacyNote = prepared.filter((p) => p.legacyPublic).length
    counts.legacyPublic += legacyNote
    const summary = prepared.map((p) => `"${p.filename}" (${p.mime})${p.legacyPublic ? ' [LEGACY-PUBLIC source]' : ''}`).join(', ')

    if (!APPLY) {
      console.log(`  MIGRATE  ${tag}: ${prepared.length} file(s): ${summary}`)
      counts.wouldMigrate++
      counts.files += prepared.length
      continue
    }

    const written: string[] = []
    try {
      const data: Prisma.CommentAttachmentCreateManyInput[] = []
      for (const p of prepared) {
        const storedName = generateStoredName(p.extension)
        await persistFile(storedName, p.bytes)
        written.push(storedName)
        data.push({
          commentType: TODO_COMMENT_TYPE, commentId: c.id, entityId: c.todoId,
          uploadedById: p.uploadedById, filename: p.filename, storedName,
          mimeType: p.mime, size: p.bytes.byteLength, width: p.width, height: p.height,
          createdAt: p.createdAt,
        })
      }
      await prisma.$transaction(async (tx) => {
        // Re-check inside the transaction so two concurrent runs cannot both write.
        const again = await tx.commentAttachment.count({ where: { commentType: TODO_COMMENT_TYPE, commentId: c.id } })
        if (again > 0) throw new Error('migrated concurrently; left as is')
        await tx.commentAttachment.createMany({ data })
      })
      console.log(`  MIGRATED ${tag}: ${summary}`)
      counts.migrated++
      counts.files += prepared.length
    } catch (err) {
      await Promise.all(written.map((n) => deleteFile(n)))
      console.log(`  FAILED   ${tag}: ${err instanceof Error ? err.message : String(err)}`)
      counts.failed++
    }
  }

  console.log(
    `${tag0} summary: ${counts.comments} comment(s) with JSON; ` +
    (APPLY ? `migrated ${counts.migrated} (${counts.files} files), failed ${counts.failed}` : `would migrate ${counts.wouldMigrate} (${counts.files} files)`) +
    `, already migrated ${counts.alreadyMigrated}, blocked ${counts.blocked}, empty ${counts.empty}, ` +
    `dangling ids ${counts.danglingIds}, legacy-public sources ${counts.legacyPublic}`,
  )
  if (counts.legacyPublic > 0) {
    console.log(`${tag0} ${counts.legacyPublic} file(s) were read from public/uploads/todos/ — run scripts/migrate-todo-attachments-private.ts to move the card copies out of public/.`)
  }
  if (counts.blocked > 0) {
    console.log(`${tag0} blocked comments keep rendering from their JSON; fix or accept the listed files and rerun.`)
  }
}

main()
  .catch((err) => {
    console.error('[migrate-todo-comment-attachments] failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
