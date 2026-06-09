'use client'

import { useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Loader2, Printer, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { LetterLangContext, useT } from '../i18n'

interface Props {
  letterId: string
  /** Retained for prop stability — no longer used. */
  canPrint?: boolean
}

/**
 * Inline letterhead preview, ERPNext-style.
 *
 * The same HTML that the server renders here is what Puppeteer prints to PDF
 * on /pdf — so the preview, the browser print dialog, and the downloaded PDF
 * are byte-identical in layout. No two render engines, no drift.
 *
 * Print → iframe.contentWindow.print() (no popups, no popup-blocker)
 * Download PDF → /api/letters/[id]/pdf?download=1 (Puppeteer renders the same HTML)
 */
export default function PdfPreviewPanel({ letterId }: Props) {
  const t = useT()
  const { lang, font } = useContext(LetterLangContext)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // bust=force a refresh of the iframe src after a regenerate. Bumping the
  // query param is the cheapest way to invalidate the same-document load.
  const [bust, setBust] = useState(0)
  const [missing, setMissing] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fontParam = `&font=${encodeURIComponent(font)}`
  const htmlUrl = `/api/letters/${letterId}/html?lang=${lang}${fontParam}&_=${bust}`
  const printUrl = `/api/letters/${letterId}/pdf?lang=${lang}${fontParam}`
  const downloadUrl = `/api/letters/${letterId}/pdf?lang=${lang}${fontParam}&download=1`

  // When the iframe finishes loading, peek at the `x-missing-placeholders`
  // header via a separate HEAD-ish fetch so we can surface the warning band
  // without parsing the HTML.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(htmlUrl, { method: 'GET' })
      .then((r) => {
        if (!r.ok) throw new Error(`Preview failed (${r.status})`)
        const header = r.headers.get('x-missing-placeholders') || ''
        if (!cancelled) setMissing(header ? header.split(',').filter(Boolean) : [])
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'Preview failed') })
    return () => { cancelled = true }
  }, [htmlUrl])

  function onIframeLoad() {
    setLoading(false)
    // Auto-size the iframe to its content so multi-page letters aren't clipped.
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (doc?.documentElement) {
        iframe.style.height = doc.documentElement.scrollHeight + 'px'
      }
    } catch {
      // cross-origin — leave at default height
    }
  }

  function regenerate() {
    setBust((b) => b + 1)
  }

  /**
   * Print the iframe's document. iframe.contentWindow.print() opens the
   * browser's native print dialog with the exact content the user is
   * looking at — no new tab, no popup blocker, no `window.open` round-trip.
   */
  function print() {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    try {
      win.focus()
      win.print()
    } catch (e) {
      // Some browsers block cross-origin print() — fall back to the
      // /pdf route which always opens in a new tab.
      console.warn('[print] iframe.print() failed, falling back', e)
      window.open(printUrl, '_blank')
    }
  }

  function download() {
    const a = document.createElement('a')
    a.href = downloadUrl
    a.rel = 'noopener'
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={print} className="h-9">
            <Printer className="mr-1.5 size-3.5" /> {t('pdf.print')}
          </Button>
          <Button onClick={download} variant="outline" className="h-9">
            <Download className="mr-1.5 size-3.5" /> Download PDF
          </Button>
          <Button onClick={regenerate} disabled={loading} variant="ghost" className="h-9">
            <RefreshCw className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('pdf.regenerate')}
          </Button>
        </div>
        {missing.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-amber-700">
            <AlertTriangle className="size-3.5" /> {t('pdf.missing')} <strong>{missing.join(', ')}</strong>
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-[12px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-700 dark:border-red-900/30 dark:bg-red-900/15 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4" />
          <div>
            <div className="font-medium">{t('pdf.failed')}</div>
            <div className="mt-0.5 text-[12px] opacity-80">{error}</div>
            <Button onClick={regenerate} variant="link" size="sm" className="px-0">{t('pdf.retry')}</Button>
          </div>
        </div>
      ) : null}

      <div
        className="relative overflow-hidden rounded-[14px] border bg-[color:var(--ap-bg-sunken)]"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        {loading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Loading preview…
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          title="Letter preview"
          src={htmlUrl}
          onLoad={onIframeLoad}
          className="min-h-[900px] w-full bg-[color:var(--ap-bg-sunken)]"
        />
      </div>
    </div>
  )
}
