'use client'

import { useRef, useState } from 'react'
import { Download, FileText, FileX, Trash2, Upload } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  LETTER_ENCLOSURE_ACCEPT,
  enclosureHasFile,
  letterEnclosureDownloadUrl,
} from '@/lib/letter-enclosures'
import type { LetterEnclosureWithUploader } from '../types'
import { removeEnclosure, uploadEnclosure } from '../services/lettersApi'

interface Props {
  letterId: string
  enclosures: LetterEnclosureWithUploader[]
  /** May add files (preparer on a DRAFT, or letter admin). */
  canEdit: boolean
  /** Letter admin — may delete any enclosure (FR-6). */
  canAdminister?: boolean
  viewerId: string
  onChange: (next: LetterEnclosureWithUploader[]) => void
}

/**
 * FR-6 enclosures: drag-and-drop or picker upload (bytes go to private
 * storage; the server validates type, magic bytes and size), authenticated
 * download, delete by the uploader or a letter admin while the letter is
 * editable. Rows from before binary upload show "No file".
 */
export default function EnclosuresPanel({
  letterId,
  enclosures,
  canEdit,
  canAdminister = false,
  viewerId,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [pendingDelete, setPendingDelete] = useState<LetterEnclosureWithUploader | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleFiles(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : []
    if (list.length === 0) return
    setUploading(true)
    setErrors([])
    const added: LetterEnclosureWithUploader[] = []
    const failed: string[] = []
    for (const f of list) {
      try {
        added.push(await uploadEnclosure(letterId, f))
      } catch (e) {
        failed.push(e instanceof Error ? e.message : `Could not upload ${f.name}`)
      }
    }
    if (added.length) onChange([...added.reverse(), ...enclosures])
    setErrors(failed)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setErrors([])
    try {
      await removeEnclosure(letterId, pendingDelete.id)
      onChange(enclosures.filter((e) => e.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Delete failed'])
    } finally {
      setDeleting(false)
    }
  }

  const totalBytes = enclosures.reduce((s, e) => s + e.fileSize, 0)

  return (
    <div className="space-y-3">
      {canEdit && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-5 text-center transition-colors',
            dragOver ? 'border-primary-400 bg-primary-50/50' : 'border-border',
          )}
        >
          <Upload className="size-4 text-muted-foreground" aria-hidden />
          <p className="text-body-sm text-muted-foreground">
            Drop files here or{' '}
            <button
              type="button"
              className="font-medium text-primary-600 hover:underline disabled:opacity-60"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              choose files
            </button>
          </p>
          <p className="text-caption text-muted-foreground">PDF, DOCX, XLSX, PNG or JPG · up to 20 MB each</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={LETTER_ENCLOSURE_ACCEPT}
            className="hidden"
            aria-label="Choose enclosure files"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {uploading && <p className="text-caption text-muted-foreground" role="status">Uploading…</p>}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700" role="alert">
          {errors.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}

      {enclosures.length === 0 ? (
        <EmptyState bare icon={FileText} title="No enclosures attached yet" />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {enclosures.map((e) => {
            const hasFile = enclosureHasFile(e.storagePath)
            const canDelete = canEdit && (canAdminister || e.uploadedById === viewerId)
            return (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                {hasFile ? (
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <FileX className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  {hasFile ? (
                    <a
                      href={letterEnclosureDownloadUrl(letterId, e.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {e.fileName}
                    </a>
                  ) : (
                    <span className="block truncate text-sm font-medium text-foreground">{e.fileName}</span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(e.fileSize)} · {e.uploadedBy.name} · {new Date(e.createdAt).toLocaleString()}
                    {!hasFile && <span className="ml-1 italic">· No file</span>}
                  </div>
                </div>
                {hasFile && (
                  <a
                    href={letterEnclosureDownloadUrl(letterId, e.id)}
                    download={e.fileName}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Download ${e.fileName}`}
                  >
                    <Download className="size-4" />
                  </a>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(e)}
                    className="text-muted-foreground hover:text-danger-600"
                    aria-label={`Delete ${e.fileName}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-right text-xs text-muted-foreground">
        {enclosures.length} file{enclosures.length === 1 ? '' : 's'} · total {formatBytes(totalBytes)}
      </p>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete enclosure"
        message={pendingDelete ? `Delete “${pendingDelete.fileName}”? The file is removed permanently.` : ''}
        confirmLabel="Delete"
        isLoading={deleting}
      />
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
