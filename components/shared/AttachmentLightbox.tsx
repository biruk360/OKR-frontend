'use client'

/**
 * AttachmentLightbox — full-size preview for comment attachments.
 *
 * Images and PDFs open here; anything else opens in a new tab (PRV-5), which
 * is decided by the caller. Built on components/ui/Modal so it inherits the
 * Radix focus trap, focus restore and Escape handling rather than re-rolling
 * them.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md PRV-3, PRV-4, PRV-6, PRV-7.
 */

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileWarning } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

export interface LightboxItem {
  id: string
  filename: string
  mimeType: string
  size: number
  url: string
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

/** Can this open in the lightbox, or does it need a tab? */
export function isPreviewable(mimeType: string): boolean {
  return isImage(mimeType) || isPdf(mimeType)
}

export default function AttachmentLightbox({
  items,
  startId,
  onClose,
}: {
  /** Previewable items of one comment — arrows move between these. */
  items: LightboxItem[]
  /** Which one was clicked; null closes. */
  startId: string | null
  onClose: () => void
}) {
  const startIndex = Math.max(0, items.findIndex((i) => i.id === startId))
  const [index, setIndex] = useState(startIndex)
  const [failed, setFailed] = useState(false)

  useEffect(() => { setIndex(Math.max(0, items.findIndex((i) => i.id === startId))); setFailed(false) }, [startId, items])

  const current = items[index]

  // ←/→ move between images. Modal already handles Escape.
  useEffect(() => {
    if (!startId || items.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => (i - 1 + items.length) % items.length); setFailed(false) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndex((i) => (i + 1) % items.length); setFailed(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startId, items.length])

  if (!startId || !current) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={current.filename}
      size="2xl"
      hideHeader
      className="!p-0"
    >
      <div className="flex flex-col">
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{current.filename}</p>
            <p className="text-[11px] text-[var(--ap-fg-subtle)]">
              {formatBytes(current.size)}
              {items.length > 1 && <> · {index + 1} of {items.length}</>}
            </p>
          </div>
          <a
            href={current.url}
            download={current.filename}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[12px] font-600 hover:bg-[var(--ap-bg-hover)]"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>

        <div className="relative flex min-h-[320px] items-center justify-center bg-[var(--ap-bg-sunken)] p-4">
          {failed ? (
            // PRV-7 — a deleted or unreadable file says so, rather than showing
            // a broken-image glyph.
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileWarning className="h-8 w-8 text-[var(--ap-fg-subtle)]" />
              <p className="text-[13px] font-600">This file could not be loaded</p>
              <p className="text-[12px] text-[var(--ap-fg-subtle)]">It may have been removed.</p>
            </div>
          ) : isImage(current.mimeType) ? (
            <img
              src={current.url}
              alt={current.filename}
              onError={() => setFailed(true)}
              className="max-h-[70vh] max-w-full rounded-[8px] object-contain"
            />
          ) : (
            <object data={current.url} type="application/pdf" className="h-[70vh] w-full rounded-[8px]">
              {/* PRV-4 fallback: some browsers refuse to embed PDFs. */}
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <p className="text-[13px]">This PDF cannot be shown here.</p>
                <a href={current.url} target="_blank" rel="noreferrer" className="text-[13px] font-600 text-[var(--ap-accent)] hover:underline">
                  Open in a new tab
                </a>
              </div>
            </object>
          )}

          {items.length > 1 && (
            <>
              {([['prev', ChevronLeft, 'left-3', -1], ['next', ChevronRight, 'right-3', 1]] as const).map(
                ([key, Icon, pos, delta]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={key === 'prev' ? 'Previous attachment' : 'Next attachment'}
                    onClick={() => { setIndex((i) => (i + delta + items.length) % items.length); setFailed(false) }}
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 rounded-full bg-[var(--ap-bg-raised)] p-1.5 shadow-sm hover:shadow',
                      pos,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ),
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
