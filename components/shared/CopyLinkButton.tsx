'use client'

/**
 * CopyLinkButton — one copy-to-clipboard control.
 *
 * Before this the pattern was re-implemented at every call site as
 * `navigator.clipboard.writeText(...)` plus a toast, each with slightly
 * different wording, no feedback on the button itself, and no handling for the
 * case where the clipboard API is unavailable (older Safari, any non-HTTPS
 * origin) — where the copy silently failed but still reported success.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md SHR-8.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Copy text, returning whether it actually worked.
 *
 * `navigator.clipboard` is undefined outside a secure context, so the
 * execCommand path is a real fallback rather than legacy cruft.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through — permission denied or insecure origin */
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export interface CopyLinkButtonProps {
  /** The text to copy. Ignored when `getValue` is given. */
  value?: string
  /** For a value that must be fetched or computed at click time. */
  getValue?: () => string | Promise<string>
  label?: string
  copiedLabel?: string
  successMessage?: string
  errorMessage?: string
  className?: string
  iconOnly?: boolean
  title?: string
}

export default function CopyLinkButton({
  value,
  getValue,
  label = 'Copy link',
  copiedLabel = 'Copied',
  successMessage = 'Link copied',
  errorMessage = 'Could not copy the link',
  className,
  iconOnly = false,
  title,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the timer on unmount, or a copy just before close sets state on a
  // component that is gone.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onClick = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const text = getValue ? await getValue() : value
      if (!text) throw new Error('Nothing to copy')
      const ok = await copyToClipboard(text)
      if (!ok) throw new Error('Clipboard unavailable')
      setCopied(true)
      toast.success(successMessage)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error(err instanceof Error && err.message !== 'Clipboard unavailable' ? err.message : errorMessage)
    } finally {
      setBusy(false)
    }
  }, [busy, getValue, value, successMessage, errorMessage])

  const Icon = copied ? Check : Link2
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title ?? label}
      aria-label={title ?? label}
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60',
        copied && 'text-[var(--ap-ok)]',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </button>
  )
}
