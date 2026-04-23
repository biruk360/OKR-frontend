'use client'

import { useMemo } from 'react'
import DOMPurify from 'dompurify'

interface Props {
  /** HTML string from the rich-text editor (or plain text from legacy comments). */
  html: string
  className?: string
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'span',
]
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class']

/**
 * Renders comment content as sanitized HTML. Legacy plaintext comments (no
 * HTML tags) are wrapped in a `<p>` with line breaks preserved so they keep
 * rendering identically.
 */
export default function RichTextContent({ html, className }: Props) {
  const safe = useMemo(() => {
    if (!html) return ''
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(html)
    const input = looksLikeHtml
      ? html
      : `<p>${escapeHtml(html).replace(/\n/g, '<br />')}</p>`
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    })
  }, [html])

  return (
    <div
      className={`prose prose-sm max-w-none break-words ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
