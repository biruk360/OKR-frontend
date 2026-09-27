'use client'

/**
 * Card modal attachment grid. Opening goes through the shared attachment
 * viewer owned by TodoCardModal (AVW-1/AVW-3); files are read through the
 * authenticated /api/todos/[id]/attachments/[attachmentId] route, never a
 * static path. Split out of TodoCardModal.tsx; behaviour unchanged.
 */

import { Paperclip, Trash2, File as FileIcon } from 'lucide-react'
import type { CommentAttachmentDto, useAttachmentViewer } from '@/components/shared/CommentAttachments'
import type { AttachmentData, TodoCardData } from './cardModalTypes'

export type CardAttachmentViewer = ReturnType<typeof useAttachmentViewer>

export interface CardAttachmentsProps {
  todo: TodoCardData
  cardAttachmentViewer: CardAttachmentViewer
  attachmentUrl: (attachmentId: string) => string
  toViewerDto: (a: AttachmentData) => CommentAttachmentDto
  deleteAttachment: (attachmentId: string) => void
}

export function CardAttachments({
  todo, cardAttachmentViewer, attachmentUrl, toViewerDto, deleteAttachment,
}: CardAttachmentsProps) {
  if (todo.attachments.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Paperclip className="h-3.5 w-3.5 text-[var(--ap-fg-muted)]" />
        <span className="text-xs font-semibold text-[var(--ap-fg-muted)]">Attachments</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {todo.attachments.map((att) => {
          // A thumbnail that fails falls back to the file icon
          // rather than the browser's broken-image glyph (PRV-7).
          const isImage = att.mimeType.startsWith('image/') && !cardAttachmentViewer.isBroken(att.id)
          return (
            <div key={att.id} className="group relative flex items-center gap-2 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] p-2 overflow-hidden">
              {isImage ? (
                <button
                  type="button"
                  onClick={() => cardAttachmentViewer.open(toViewerDto(att))}
                  aria-label={`Open ${att.filename}`}
                  title={att.filename}
                  className="shrink-0 overflow-hidden rounded-[var(--ap-radius-xs)] transition hover:brightness-95"
                >
                  <img
                    src={attachmentUrl(att.id)}
                    alt={att.filename}
                    onError={() => cardAttachmentViewer.markBroken(att.id)}
                    className="h-10 w-10 object-cover"
                  />
                </button>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ap-radius-xs)] bg-[var(--ap-bg-hover)]">
                  <FileIcon className="h-5 w-5 text-[var(--ap-fg-subtle)]" />
                </div>
              )}
              <button
                type="button"
                onClick={() => cardAttachmentViewer.open(toViewerDto(att))}
                aria-label={`Open ${att.filename}`}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-xs font-medium text-[var(--ap-fg)]">{att.filename}</p>
                <p className="text-caption text-[var(--ap-fg-subtle)]">{(att.size / 1024).toFixed(0)} KB</p>
              </button>
              <button
                type="button"
                onClick={() => deleteAttachment(att.id)}
                aria-label={`Remove ${att.filename}`}
                className="absolute right-1 top-1 hidden rounded-[var(--ap-radius-xs)] p-0.5 text-[var(--ap-fg-faint)] hover:text-[var(--ap-danger)] group-hover:flex transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
