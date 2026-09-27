/**
 * TOR upload for AI-guided creation (remediation 2026-09-25, C5).
 *
 * Reuses the G4 import security path exactly: the same file allowlist/size limit
 * (`validateProjectCreationImportFile`, DOCX only here — PDF is not on the import
 * allowlist), the same content validation + ClamAV scan + private storage
 * (`secureProjectCreationUpload`, fails closed when clamd is unavailable), and the
 * same bounded DOCX extractor (`extractProjectCreationDocx`). The extracted text is
 * returned for the TOR field, where it stays editable and is later sent to AI only
 * inside the prompt's untrusted-data block. No AI call happens here, and neither
 * the audit entry nor any log contains document content.
 */
import type { Prisma, ProjectCreationDraft } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { requireProjectCreationAiEnabled } from '@/lib/ai/config'
import {
  ProjectCreationDraftNotFoundError,
  ProjectCreationDraftStateError,
  ProjectCreationDraftVersionConflictError,
} from './creation-draft'
import {
  ProjectCreationImportError,
  resolveProjectCreationImportLimits,
  validateProjectCreationImportFile,
} from './creation-import'
import {
  deleteSecureProjectCreationUpload,
  secureProjectCreationUpload,
  type ProjectCreationMalwareScanner,
} from './creation-upload-security'
import { extractProjectCreationDocx, type ProjectCreationDocxExtraction } from './docx-extract'
import { AI_GUIDED_BRIEF_LIMITS, normalizeAiGuidedLongText } from './ai-guided-brief'

const AI_METHODS = ['AI_GUIDED', 'AI_TOR'] as const
const EDITABLE = ['DRAFT', 'READY', 'FAILED'] as const

/** Flattens extracted DOCX blocks (headings, paragraphs, table rows) into TOR text. */
export function projectCreationDocxToTorText(
  extraction: Pick<ProjectCreationDocxExtraction, 'blocks'>,
  maxCharacters: number = AI_GUIDED_BRIEF_LIMITS.torMax,
): { text: string; truncated: boolean; fullLength: number } {
  const parts = extraction.blocks.map((block) => {
    if (block.type === 'TABLE') return block.rows.map((row) => row.join(' | ')).join('\n')
    if (block.type === 'PARAGRAPH' && block.isListItem) return `- ${block.text}`
    return block.text
  })
  const full = normalizeAiGuidedLongText(parts.join('\n\n'))
  if (full.length <= maxCharacters) return { text: full, truncated: false, fullLength: full.length }
  const cut = full.slice(0, maxCharacters)
  const boundary = cut.lastIndexOf('\n')
  const text = (boundary > maxCharacters * 0.8 ? cut.slice(0, boundary) : cut).trimEnd()
  return { text, truncated: true, fullLength: full.length }
}

interface TorDraftDelegate {
  findUnique(args: { where: { id: string } }): Promise<ProjectCreationDraft | null>
  updateMany(args: Prisma.ProjectCreationDraftUpdateManyArgs): Promise<{ count: number }>
}

export interface AiGuidedTorUploadDeps {
  db: {
    projectCreationDraft: TorDraftDelegate
    $transaction<T>(operation: (tx: {
      projectCreationDraft: TorDraftDelegate
      activityLog: { create(args: unknown): Promise<unknown> }
    }) => Promise<T>): Promise<T>
  }
  requireEnabled(): Promise<void>
  scanner?: ProjectCreationMalwareScanner
  storageRoot?: string
  deleteUpload(sourceRef: string): Promise<void>
}

function defaultDeps(): AiGuidedTorUploadDeps {
  return {
    db: prisma as unknown as AiGuidedTorUploadDeps['db'],
    requireEnabled: () => requireProjectCreationAiEnabled(),
    deleteUpload: (sourceRef) => deleteSecureProjectCreationUpload(sourceRef),
  }
}

function assertOwnedAiDraft(row: ProjectCreationDraft | null, actorUserId: string, version: number): ProjectCreationDraft {
  if (!row || row.ownerUserId !== actorUserId) throw new ProjectCreationDraftNotFoundError()
  if (!(AI_METHODS as readonly string[]).includes(row.sourceMethod)) {
    throw new ProjectCreationDraftStateError(row.status, 'This draft was not started with AI-guided creation.')
  }
  if (!(EDITABLE as readonly string[]).includes(row.status)) {
    throw new ProjectCreationDraftStateError(row.status, `Drafts in ${row.status} status cannot be edited`)
  }
  if (row.version !== version) throw new ProjectCreationDraftVersionConflictError(version, row.version)
  return row
}

export interface AiGuidedTorUploadResult {
  draft: ProjectCreationDraft
  torText: string
  truncated: boolean
  extractedCharacters: number
}

export async function uploadAiGuidedTor(
  input: {
    draftId: string
    actorUserId: string
    version: number
    /** Bytes are read only after the draft, type, and size checks pass. */
    file: { name: string; type: string; size: number; readBytes(): Promise<Uint8Array> }
  },
  deps: AiGuidedTorUploadDeps = defaultDeps(),
): Promise<AiGuidedTorUploadResult> {
  await deps.requireEnabled()
  const current = assertOwnedAiDraft(
    await deps.db.projectCreationDraft.findUnique({ where: { id: input.draftId } }),
    input.actorUserId,
    input.version,
  )
  const validated = validateProjectCreationImportFile({
    name: input.file.name,
    type: input.file.type,
    size: input.file.size,
    maxFileBytes: resolveProjectCreationImportLimits().maxFileBytes,
  })
  if (validated.kind !== 'DOCX') {
    throw new ProjectCreationImportError('Upload the TOR as a Word (.docx) document, or paste its text.', 'INVALID_FILE')
  }
  const bytes = await input.file.readBytes()
  // Scan-before-extraction: nothing is parsed until the file is stored clean (fails closed).
  const stored = await secureProjectCreationUpload({
    draftId: current.id,
    extension: 'docx',
    bytes,
    scanner: deps.scanner,
    storageRoot: deps.storageRoot,
  })
  try {
    const extraction = await extractProjectCreationDocx(bytes)
    const tor = projectCreationDocxToTorText(extraction)
    if (!tor.text) {
      throw new ProjectCreationImportError('The TOR document has no readable text. Paste the text instead.', 'PARSE_FAILED')
    }
    const draft = await deps.db.$transaction(async (tx) => {
      const result = await tx.projectCreationDraft.updateMany({
        where: {
          id: current.id,
          ownerUserId: input.actorUserId,
          version: input.version,
          status: { in: [...EDITABLE] },
        },
        data: {
          sourceFileName: validated.safeFileName,
          sourceMimeType: stored.detectedMimeType,
          sourceSize: input.file.size,
          sourceHash: stored.hash,
          sourceRef: stored.sourceRef,
          version: { increment: 1 },
        },
      })
      if (result.count !== 1) {
        const latest = await tx.projectCreationDraft.findUnique({ where: { id: current.id } })
        if (!latest) throw new ProjectCreationDraftNotFoundError()
        throw new ProjectCreationDraftVersionConflictError(input.version, latest.version)
      }
      const updated = await tx.projectCreationDraft.findUnique({ where: { id: current.id } })
      if (!updated) throw new ProjectCreationDraftNotFoundError()
      await recordActivity({
        entityType: 'PROJECT_CREATION_DRAFT',
        action: 'UPDATED',
        actorId: input.actorUserId,
        changes: { version: { from: current.version, to: updated.version } },
        metadata: {
          draftId: updated.id,
          kind: 'AI_GUIDED_TOR_UPLOADED',
          changedFields: ['sourceMetadata'],
          status: updated.status,
          fileName: validated.safeFileName,
          sourceMimeType: stored.detectedMimeType,
          sourceSize: input.file.size,
          sourceHash: stored.hash,
          scanStatus: stored.scanStatus,
          extractedCharacters: tor.fullLength,
          truncated: tor.truncated,
        },
      }, { client: tx, required: true })
      return updated
    })
    if (current.sourceRef && current.sourceRef !== stored.sourceRef) {
      await deps.deleteUpload(current.sourceRef).catch(() => undefined)
    }
    return { draft, torText: tor.text, truncated: tor.truncated, extractedCharacters: tor.fullLength }
  } catch (error) {
    await deps.deleteUpload(stored.sourceRef).catch(() => undefined)
    throw error
  }
}
