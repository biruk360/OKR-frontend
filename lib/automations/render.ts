/**
 * Briefing renderers: one block list → three representations.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §8.2.
 *
 *   renderAppHtml   — in-app, Apple-HIG design tokens (docs/DESIGN_SYSTEM.md)
 *   renderEmailHtml — table-based, inline styles, 600px, light-mode-safe
 *   renderPlainText — the text/plain alternative for MailMessage.text
 *
 * Safety: model-produced text is escaped, never parsed as HTML. The renderers
 * emit only markup they construct themselves, so there is no sanitiser to
 * outrun — a `<script>` in a finding title renders as visible text.
 */

import type { BriefingBlock, BlockTone, FindingStatus } from '@/types/automations'

// ---------------------------------------------------------------------------
// Escaping and constrained inline formatting
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only http(s) links survive — `javascript:` and friends are dropped. */
export function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    // Relative in-app paths are fine; anything else is not.
    return url.startsWith('/') && !url.startsWith('//') ? url : null
  }
}

/**
 * Escape first, then apply the three inline forms the block model allows:
 * `**bold**`, `_italic_`, `[label](url)`. Because escaping runs first, markup in
 * the source text can never become live HTML.
 */
export function renderInline(text: string, linkStyle = ''): string {
  let out = escapeHtml(text)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, rawUrl: string) => {
    const href = safeUrl(rawUrl.replace(/&amp;/g, '&'))
    if (!href) return label
    return `<a href="${escapeHtml(href)}"${linkStyle ? ` style="${linkStyle}"` : ''}>${label}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[\s(])_([^_]+)_(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>')
  return out
}

function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])_([^_]+)_(?=$|[\s.,;:!?)])/g, '$1$2')
}

// ---------------------------------------------------------------------------
// Tone palettes (docs/DESIGN_SYSTEM.md §2.3)
// ---------------------------------------------------------------------------

const TONE_HEX: Record<BlockTone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: '#1D1D1F', bg: '#F9F9FB', border: '#E5E5EA' },
  success: { fg: '#248A3D', bg: '#EAF9EE', border: '#34C759' },
  warning: { fg: '#B25E00', bg: '#FFF4E5', border: '#FF9500' },
  danger: { fg: '#C9271D', bg: '#FDECEA', border: '#FF3B30' },
}

const TONE_CLASS: Record<BlockTone, string> = {
  neutral: 'border-surface-muted bg-surface-sidebar text-ink-primary',
  success: 'border-success-500 bg-success-500/10 text-ink-primary',
  warning: 'border-warning-500 bg-warning-500/10 text-ink-primary',
  danger: 'border-danger-500 bg-danger-500/10 text-ink-primary',
}

const STATUS_CLASS: Record<FindingStatus, string> = {
  NEW: 'bg-primary-500/10 text-primary-600',
  CHANGED: 'bg-warning-500/15 text-warning-600',
  UNCHANGED: 'bg-surface-muted text-ink-secondary',
  RESOLVED: 'bg-success-500/10 text-success-600',
}

const STATUS_HEX: Record<FindingStatus, { fg: string; bg: string }> = {
  NEW: { fg: '#0063CC', bg: '#E6F1FF' },
  CHANGED: { fg: '#B25E00', bg: '#FFF4E5' },
  UNCHANGED: { fg: '#8E8E93', bg: '#F2F2F7' },
  RESOLVED: { fg: '#248A3D', bg: '#EAF9EE' },
}

// ---------------------------------------------------------------------------
// In-app HTML
// ---------------------------------------------------------------------------

export function renderAppHtml(blocks: BriefingBlock[]): string {
  const parts: string[] = []
  let metricRun: string[] = []

  const flushMetrics = () => {
    if (metricRun.length === 0) return
    parts.push(
      `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 my-4">${metricRun.join('')}</div>`
    )
    metricRun = []
  }

  for (const block of blocks) {
    if (block.type === 'metric') {
      const tone = block.tone ?? 'neutral'
      const toneText =
        tone === 'success' ? 'text-success-500'
        : tone === 'warning' ? 'text-warning-500'
        : tone === 'danger' ? 'text-danger-500'
        : 'text-ink-primary'
      metricRun.push(
        `<div class="rounded-card border border-surface-muted bg-surface-card p-4">` +
        `<p class="text-body-sm text-ink-secondary">${escapeHtml(block.label)}</p>` +
        `<p class="mt-1 text-2xl font-semibold ${toneText}">${escapeHtml(block.value)}</p>` +
        (block.delta ? `<p class="mt-1 text-body-sm text-ink-secondary">${escapeHtml(block.delta)}</p>` : '') +
        `</div>`
      )
      continue
    }
    flushMetrics()

    switch (block.type) {
      case 'heading':
        parts.push(
          block.level === 3
            ? `<h3 class="mt-6 mb-2 text-body font-semibold text-ink-primary">${escapeHtml(block.text)}</h3>`
            : `<h2 class="mt-8 mb-3 text-section-title text-ink-primary">${escapeHtml(block.text)}</h2>`
        )
        break

      case 'paragraph':
        parts.push(`<p class="my-3 text-body text-ink-primary leading-relaxed">${renderInline(block.text)}</p>`)
        break

      case 'table': {
        const head = block.columns.map((c) => `<th class="px-3 py-2 text-left text-body-sm font-medium text-ink-secondary">${escapeHtml(c)}</th>`).join('')
        const body = block.rows.map((row) =>
          `<tr class="border-t border-surface-muted">${row.map((cell) => `<td class="px-3 py-2 text-body-sm text-ink-primary align-top">${renderInline(cell)}</td>`).join('')}</tr>`
        ).join('')
        parts.push(
          `<div class="my-4 overflow-x-auto rounded-card border border-surface-muted bg-surface-card">` +
          `<table class="w-full border-collapse"><thead class="bg-surface-sidebar"><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
          (block.caption ? `<p class="px-3 py-2 text-body-sm text-ink-secondary">${escapeHtml(block.caption)}</p>` : '') +
          `</div>`
        )
        break
      }

      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul'
        const listClass = block.ordered ? 'list-decimal' : 'list-disc'
        parts.push(
          `<${tag} class="my-3 ${listClass} pl-5 space-y-1 text-body text-ink-primary">` +
          block.items.map((i) => `<li>${renderInline(i)}</li>`).join('') +
          `</${tag}>`
        )
        break
      }

      case 'callout':
        parts.push(
          `<div class="my-4 rounded-card border-l-4 ${TONE_CLASS[block.tone]} px-4 py-3">` +
          (block.title ? `<p class="text-body font-semibold">${escapeHtml(block.title)}</p>` : '') +
          `<p class="text-body-sm">${renderInline(block.text)}</p>` +
          `</div>`
        )
        break

      case 'finding': {
        const href = block.url ? safeUrl(block.url) : null
        const fieldRows = block.fields
          ? Object.entries(block.fields)
              .map(([k, v]) => `<span class="text-body-sm text-ink-secondary">${escapeHtml(k)}: <span class="text-ink-primary">${escapeHtml(v)}</span></span>`)
              .join('<span class="text-ink-tertiary"> · </span>')
          : ''
        parts.push(
          `<div class="my-2 rounded-card border border-surface-muted bg-surface-card p-4">` +
          `<div class="flex items-start justify-between gap-3">` +
          `<p class="text-body font-medium text-ink-primary">` +
          (href ? `<a class="hover:text-primary-600" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(block.title)}</a>` : escapeHtml(block.title)) +
          `</p>` +
          `<span class="shrink-0 rounded-full px-2 py-0.5 text-body-sm ${STATUS_CLASS[block.status]}">${block.status.toLowerCase()}</span>` +
          `</div>` +
          (fieldRows ? `<div class="mt-2 flex flex-wrap gap-x-1 gap-y-1">${fieldRows}</div>` : '') +
          (block.changeNote ? `<p class="mt-2 text-body-sm text-warning-500">${escapeHtml(block.changeNote)}</p>` : '') +
          `</div>`
        )
        break
      }

      case 'linkCard': {
        const href = safeUrl(block.url)
        const inner =
          `<p class="text-body font-medium text-ink-primary">${escapeHtml(block.title)}</p>` +
          (block.source || block.publishedAt
            ? `<p class="mt-0.5 text-body-sm text-ink-secondary">${escapeHtml([block.source, block.publishedAt].filter(Boolean).join(' · '))}</p>`
            : '') +
          (block.snippet ? `<p class="mt-1 text-body-sm text-ink-secondary">${escapeHtml(block.snippet)}</p>` : '')
        parts.push(
          href
            ? `<a class="my-2 block rounded-card border border-surface-muted bg-surface-card p-4 transition-colors hover:bg-surface-hover" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
            : `<div class="my-2 rounded-card border border-surface-muted bg-surface-card p-4">${inner}</div>`
        )
        break
      }

      case 'divider':
        parts.push('<hr class="my-6 border-surface-muted" />')
        break
    }
  }

  flushMetrics()
  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Email HTML — tables and inline styles, because Outlook
// ---------------------------------------------------------------------------

const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif"
const EMAIL_LINK = `color:#007AFF;text-decoration:none`

function emailRow(inner: string): string {
  return `<tr><td style="padding:0 24px;">${inner}</td></tr>`
}

export function renderEmailHtml(
  blocks: BriefingBlock[],
  meta: { title: string; summary: string; footerNote?: string; viewUrl?: string }
): string {
  const rows: string[] = []
  let metricRun: string[] = []

  const flushMetrics = () => {
    if (metricRun.length === 0) return
    rows.push(emailRow(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;"><tr>${metricRun.join('')}</tr></table>`
    ))
    metricRun = []
  }

  for (const block of blocks) {
    if (block.type === 'metric') {
      const tone = TONE_HEX[block.tone ?? 'neutral']
      metricRun.push(
        `<td width="50%" style="padding:6px;vertical-align:top;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E5EA;border-radius:12px;background:#FFFFFF;">` +
        `<tr><td style="padding:12px 14px;">` +
        `<div style="font:400 12px/16px ${EMAIL_FONT};color:#8E8E93;">${escapeHtml(block.label)}</div>` +
        `<div style="font:600 22px/28px ${EMAIL_FONT};color:${tone.fg};padding-top:4px;">${escapeHtml(block.value)}</div>` +
        (block.delta ? `<div style="font:400 12px/16px ${EMAIL_FONT};color:#8E8E93;padding-top:2px;">${escapeHtml(block.delta)}</div>` : '') +
        `</td></tr></table></td>`
      )
      // Two metrics per row keeps the table legible on a phone.
      if (metricRun.length === 2) flushMetrics()
      continue
    }
    flushMetrics()

    switch (block.type) {
      case 'heading':
        rows.push(emailRow(
          `<div style="font:600 ${block.level === 3 ? '15px/22px' : '18px/26px'} ${EMAIL_FONT};color:#1D1D1F;padding:${block.level === 3 ? '16px 0 4px' : '22px 0 8px'};">${escapeHtml(block.text)}</div>`
        ))
        break

      case 'paragraph':
        rows.push(emailRow(
          `<div style="font:400 14px/22px ${EMAIL_FONT};color:#1D1D1F;padding:6px 0;">${renderInline(block.text, EMAIL_LINK)}</div>`
        ))
        break

      case 'table': {
        const head = block.columns.map((c) =>
          `<th align="left" style="font:500 12px/18px ${EMAIL_FONT};color:#8E8E93;padding:8px 10px;background:#F9F9FB;">${escapeHtml(c)}</th>`
        ).join('')
        const body = block.rows.map((row) =>
          `<tr>${row.map((cell) =>
            `<td style="font:400 13px/19px ${EMAIL_FONT};color:#1D1D1F;padding:8px 10px;border-top:1px solid #E5E5EA;vertical-align:top;">${renderInline(cell, EMAIL_LINK)}</td>`
          ).join('')}</tr>`
        ).join('')
        rows.push(emailRow(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E5EA;border-radius:12px;border-collapse:separate;overflow:hidden;margin:10px 0;">` +
          `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
          (block.caption ? `<div style="font:400 12px/18px ${EMAIL_FONT};color:#8E8E93;padding:4px 2px;">${escapeHtml(block.caption)}</div>` : '')
        ))
        break
      }

      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul'
        rows.push(emailRow(
          `<${tag} style="font:400 14px/22px ${EMAIL_FONT};color:#1D1D1F;padding:4px 0 4px 20px;margin:0;">` +
          block.items.map((i) => `<li style="padding:2px 0;">${renderInline(i, EMAIL_LINK)}</li>`).join('') +
          `</${tag}>`
        ))
        break
      }

      case 'callout': {
        const tone = TONE_HEX[block.tone]
        rows.push(emailRow(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0;background:${tone.bg};border-left:3px solid ${tone.border};border-radius:8px;">` +
          `<tr><td style="padding:10px 14px;">` +
          (block.title ? `<div style="font:600 14px/20px ${EMAIL_FONT};color:#1D1D1F;">${escapeHtml(block.title)}</div>` : '') +
          `<div style="font:400 13px/20px ${EMAIL_FONT};color:#1D1D1F;">${renderInline(block.text, EMAIL_LINK)}</div>` +
          `</td></tr></table>`
        ))
        break
      }

      case 'finding': {
        const href = block.url ? safeUrl(block.url) : null
        const status = STATUS_HEX[block.status]
        const fields = block.fields
          ? Object.entries(block.fields)
              .map(([k, v]) => `<span style="color:#8E8E93;">${escapeHtml(k)}:</span> ${escapeHtml(v)}`)
              .join('<span style="color:#D1D1D6;"> &middot; </span>')
          : ''
        rows.push(emailRow(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0;border:1px solid #E5E5EA;border-radius:12px;background:#FFFFFF;">` +
          `<tr><td style="padding:12px 14px;">` +
          `<span style="display:inline-block;font:500 11px/16px ${EMAIL_FONT};color:${status.fg};background:${status.bg};border-radius:10px;padding:1px 8px;margin-bottom:6px;">${block.status.toLowerCase()}</span>` +
          `<div style="font:500 14px/20px ${EMAIL_FONT};color:#1D1D1F;">` +
          (href ? `<a href="${escapeHtml(href)}" style="${EMAIL_LINK}">${escapeHtml(block.title)}</a>` : escapeHtml(block.title)) +
          `</div>` +
          (fields ? `<div style="font:400 12px/18px ${EMAIL_FONT};color:#1D1D1F;padding-top:4px;">${fields}</div>` : '') +
          (block.changeNote ? `<div style="font:400 12px/18px ${EMAIL_FONT};color:#B25E00;padding-top:4px;">${escapeHtml(block.changeNote)}</div>` : '') +
          `</td></tr></table>`
        ))
        break
      }

      case 'linkCard': {
        const href = safeUrl(block.url)
        rows.push(emailRow(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0;border:1px solid #E5E5EA;border-radius:12px;background:#FFFFFF;">` +
          `<tr><td style="padding:12px 14px;">` +
          `<div style="font:500 14px/20px ${EMAIL_FONT};color:#1D1D1F;">` +
          (href ? `<a href="${escapeHtml(href)}" style="${EMAIL_LINK}">${escapeHtml(block.title)}</a>` : escapeHtml(block.title)) +
          `</div>` +
          (block.source || block.publishedAt
            ? `<div style="font:400 12px/18px ${EMAIL_FONT};color:#8E8E93;padding-top:2px;">${escapeHtml([block.source, block.publishedAt].filter(Boolean).join(' · '))}</div>`
            : '') +
          (block.snippet ? `<div style="font:400 12px/18px ${EMAIL_FONT};color:#8E8E93;padding-top:4px;">${escapeHtml(block.snippet)}</div>` : '') +
          `</td></tr></table>`
        ))
        break
      }

      case 'divider':
        rows.push(emailRow(`<div style="border-top:1px solid #E5E5EA;margin:18px 0;"></div>`))
        break
    }
  }

  flushMetrics()

  const viewLink = meta.viewUrl
    ? `<div style="padding:18px 0 4px;"><a href="${escapeHtml(meta.viewUrl)}" style="display:inline-block;font:500 13px/20px ${EMAIL_FONT};color:#FFFFFF;background:#007AFF;border-radius:8px;padding:8px 16px;text-decoration:none;">Open in the app</a></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(meta.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F2F2F7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(meta.summary)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;border:1px solid #E5E5EA;">
<tr><td style="padding:24px 24px 4px;">
<div style="font:600 20px/28px ${EMAIL_FONT};color:#1D1D1F;">${escapeHtml(meta.title)}</div>
<div style="font:400 14px/21px ${EMAIL_FONT};color:#8E8E93;padding-top:6px;">${escapeHtml(meta.summary)}</div>
</td></tr>
${rows.join('\n')}
${viewLink ? emailRow(viewLink) : ''}
<tr><td style="padding:16px 24px 24px;">
<div style="border-top:1px solid #E5E5EA;padding-top:12px;font:400 12px/18px ${EMAIL_FONT};color:#8E8E93;">
${escapeHtml(meta.footerNote ?? 'Generated automatically by an Automation. Reply to the sender if this should stop.')}
</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function renderPlainText(
  blocks: BriefingBlock[],
  meta: { title: string; summary: string }
): string {
  const lines: string[] = [meta.title, '='.repeat(Math.min(meta.title.length, 72)), '', meta.summary, '']

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        lines.push('', block.level === 3 ? `-- ${block.text}` : block.text.toUpperCase(), '')
        break
      case 'paragraph':
        lines.push(stripInline(block.text), '')
        break
      case 'metric':
        lines.push(`${block.label}: ${block.value}${block.delta ? ` (${block.delta})` : ''}`)
        break
      case 'table': {
        lines.push(block.columns.join(' | '))
        lines.push(block.columns.map(() => '---').join(' | '))
        for (const row of block.rows) lines.push(row.map(stripInline).join(' | '))
        if (block.caption) lines.push(block.caption)
        lines.push('')
        break
      }
      case 'list':
        block.items.forEach((item, i) => lines.push(`${block.ordered ? `${i + 1}.` : '-'} ${stripInline(item)}`))
        lines.push('')
        break
      case 'callout':
        lines.push(`[${block.tone.toUpperCase()}] ${block.title ? `${block.title}: ` : ''}${stripInline(block.text)}`, '')
        break
      case 'finding': {
        const fields = block.fields ? Object.entries(block.fields).map(([k, v]) => `${k}: ${v}`).join(', ') : ''
        lines.push(`[${block.status}] ${block.title}`)
        if (fields) lines.push(`    ${fields}`)
        if (block.changeNote) lines.push(`    changed — ${block.changeNote}`)
        if (block.url) lines.push(`    ${block.url}`)
        break
      }
      case 'linkCard':
        lines.push(`* ${block.title}${block.source ? ` (${block.source})` : ''}`)
        lines.push(`    ${block.url}`)
        if (block.snippet) lines.push(`    ${block.snippet}`)
        break
      case 'divider':
        lines.push('', '-'.repeat(40), '')
        break
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
