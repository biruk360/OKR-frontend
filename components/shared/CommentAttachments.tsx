'use client'

/**
 * Attachment UI shared by every comment surface — one picker, one renderer,
 * one viewer, per CLAUDE.md's reuse rule (CMP-5).
 *
 *   `AttachmentPicker`  — composer control: click, drag-drop, paste.
 *   `AttachmentList`    — renders a posted comment's attachments.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md CMP-*, PRV-1, PRV-2, PRV-5.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Paperclip, X, FileText, FileSpreadsheet, File as FileIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import AttachmentLightbox, {
  formatBytes, isImage, isPreviewable, type LightboxItem,
} from './AttachmentLightbox'

export type CommentScope = 'TODO' | 'OKR' | 'ACTIVITY' | 'SCRUM'

export interface CommentAttachmentDto {
  id: string
  filename: string
  mimeType: string
  size: number
  width?: number | null
  height?: number | null
  url: string
}

function iconFor(mimeType: string) {
  if (mimeType === 'application/pdf') return FileText
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return FileSpreadsheet
  if (mimeType.startsWith('text/')) return FileText
  return FileIcon
}

// ─── Rendering a posted comment's attachments ───────────────────────────────

export function AttachmentList({ attachments }: { attachments: CommentAttachmentDto[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (attachments.length === 0) return null

  // Arrows in the lightbox move between the previewable ones only.
  const previewable: LightboxItem[] = attachments.filter((a) => isPreviewable(a.mimeType))

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {attachments.map((a) => {
          const Icon = iconFor(a.mimeType)
          if (isImage(a.mimeType)) {
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenId(a.id)}
                title={a.filename}
                aria-label={`Open ${a.filename}`}
                className="group relative overflow-hidden rounded-[10px] border transition hover:brightness-95"
                style={{ borderColor: 'var(--ap-border)' }}
              >
                <img
                  src={a.url}
                  alt={a.filename}
                  // Reserving the box from the stored dimensions stops the
                  // comment reflowing as images arrive (ATT-5).
                  width={a.width ?? undefined}
                  height={a.height ?? undefined}
                  className="max-h-48 w-auto object-cover"
                />
              </button>
            )
          }
          const previewInModal = isPreviewable(a.mimeType)
          const common = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--ap-bg-hover)]'
          return previewInModal ? (
            <button key={a.id} type="button" onClick={() => setOpenId(a.id)} className={common} style={{ borderColor: 'var(--ap-border)' }} title={a.filename}>
              <Icon className="h-3 w-3 text-[var(--ap-fg-subtle)]" />
              <span className="max-w-[180px] truncate">{a.filename}</span>
              <span className="text-[var(--ap-fg-subtle)]">{formatBytes(a.size)}</span>
            </button>
          ) : (
            // PRV-5 — not previewable, so a new tab (the route sends it as a
            // download for these types).
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className={common} style={{ borderColor: 'var(--ap-border)' }} title={a.filename}>
              <Icon className="h-3 w-3 text-[var(--ap-fg-subtle)]" />
              <span className="max-w-[180px] truncate">{a.filename}</span>
              <span className="text-[var(--ap-fg-subtle)]">{formatBytes(a.size)}</span>
            </a>
          )
        })}
      </div>

      <AttachmentLightbox items={previewable} startId={openId} onClose={() => setOpenId(null)} />
    </>
  )
}

// ─── Composer control ───────────────────────────────────────────────────────

export function AttachmentPicker({
  scope,
  entityId,
  staged,
  onStagedChange,
  disabled,
  className,
}: {
  scope: CommentScope
  /** Parent entity — the comment does not exist yet while composing. */
  entityId: string
  staged: CommentAttachmentDto[]
  onStagedChange: (next: CommentAttachmentDto[]) => void
  disabled?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(0)
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(async (files: File[]) => {
    if (files.length === 0 || disabled) return
    setBusy((n) => n + files.length)
    const uploaded: CommentAttachmentDto[] = []
    for (const file of files) {
      try {
        const body = new FormData()
        body.append('file', file)
        body.append('commentType', scope)
        body.append('entityId', entityId)
        const res = await fetch('/api/comment-attachments', { method: 'POST', body })
        const json = await res.json()
        if (!res.ok || !json.success) {
          // CMP-4 — say which file and why; the rest keep uploading.
          toast.error(json.error || `Could not attach ${file.name}`)
          continue
        }
        uploaded.push(json.data as CommentAttachmentDto)
      } catch {
        toast.error(`Could not attach ${file.name}`)
      } finally {
        setBusy((n) => n - 1)
      }
    }
    if (uploaded.length) onStagedChange([...staged, ...uploaded])
  }, [scope, entityId, staged, onStagedChange, disabled])

  const remove = useCallback(async (id: string) => {
    // CMP-3 — abandoning a draft must not leak storage.
    onStagedChange(staged.filter((a) => a.id !== id))
    try {
      await fetch(`/api/comment-attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch { /* the sweep job will catch it */ }
  }, [staged, onStagedChange])

  // CMP-1 — paste an image straight into the composer.
  useEffect(() => {
    if (disabled) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void upload(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [upload, disabled])

  return (
    <div
      className={cn('rounded-[10px] transition-colors', dragging && 'ring-2 ring-[var(--ap-accent)]', className)}
      onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(false)
        void upload(Array.from(e.dataTransfer.files))
      }}
    >
      {staged.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {staged.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
            >
              <span className="max-w-[160px] truncate">{a.filename}</span>
              <span className="text-[var(--ap-fg-subtle)]">{formatBytes(a.size)}</span>
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label={`Remove ${a.filename}`}
                className="rounded-full p-0.5 hover:bg-[var(--ap-bg-hover)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={disabled || busy > 0}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-[12px] font-600 text-[var(--ap-fg-muted)] transition-colors hover:text-[var(--ap-fg)] disabled:opacity-50"
      >
        {busy > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {busy > 0 ? `Uploading ${busy}…` : 'Attach files'}
      </button>
      <span className="ml-2 text-[11px] text-[var(--ap-fg-subtle)]">or drop / paste</span>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []))
          e.target.value = ''   // re-selecting the same file must still fire
        }}
      />
    </div>
  )
}
