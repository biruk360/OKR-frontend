'use client'

import { useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Loader2, Printer, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { generateLetterPdf } from '../services/lettersApi'
import { LetterLangContext, useT } from '../i18n'

interface Props {
  letterId: string
  /**
   * Whether the page-header level Print restriction applies. We keep the prop
   * for API stability but no longer block printing of DRAFT letters — being
   * able to print a draft for review is a normal workflow ask.
   */
  canPrint?: boolean
}

/**
 * Inline PDF preview pane. Mounts when the user opens the "PDF Preview" tab
 * (Radix Tabs unmounts inactive content), auto-fetches the PDF, and exposes
 * Print + Download + Regenerate actions.
 *
 * The PDF includes the company letterhead (logo + address band) and a
 * footer with page numbers — see `lib/letter-pdf.tsx` and `lib/letterhead.ts`.
 */
export default function PdfPreviewPanel({ letterId }: Props) {
  const t = useT()
  const { lang } = useContext(LetterLangContext)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Suppress re-fetching when the user toggles the language while the panel
  // is open — single mount = single auto-fetch; the user clicks Regenerate
  // if they want the letterhead to update.
  const autoLoadedRef = useRef(false)

  // Free the blob URL when it's replaced or the component unmounts. Without
  // this each "Regenerate" leaks a few hundred KB to the JS heap.
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  // Auto-fetch on first mount.
  useEffect(() => {
    if (autoLoadedRef.current) return
    autoLoadedRef.current = true
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate(): Promise<string | null> {
    setLoading(true)
    setError(null)
    try {
      const data = await generateLetterPdf(letterId, lang)
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      setBlobUrl(data.blobUrl)
      setMissing(data.missing)
      return data.blobUrl
    } catch (e: any) {
      setError(e?.message || 'Could not generate preview')
      return null
    } finally {
      setLoading(false)
    }
  }

  /**
   * Open the PDF in a new tab and trigger the browser's print dialog. Goes
   * through the GET endpoint (no activity log noise, just a navigation) so
   * we keep the activity feed clean.
   */
  function print() {
    const printUrl = `/api/letters/${letterId}/pdf?lang=${lang}`
    const win = window.open(printUrl, '_blank')
    if (!win) {
      // Popup blocked — fall back to a direct location change which the
      // browser cannot block.
      window.location.href = printUrl
      return
    }
    // Wait for the embedded PDF viewer to load, then open the system print
    // dialog. Window.print() works in modern Chrome/Edge/Safari/Firefox once
    // the PDF viewer's document fires `load`.
    win.addEventListener('load', () => {
      try { win.print() } catch { /* viewer may have its own UI */ }
    })
  }

  function download() {
    const url = `/api/letters/${letterId}/pdf?lang=${lang}&download=1`
    // <a download> would only work for same-origin direct links — using
    // location.assign keeps the existing tab and triggers the download.
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    a.rel = 'noopener'
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
          <Button onClick={generate} disabled={loading} variant="ghost" className="h-9">
            <RefreshCw className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('pdf.regenerate')}
          </Button>
        </div>
        {missing.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[12px] text-amber-700">
            <AlertTriangle className="size-3.5" /> {t('pdf.missing')} <strong>{missing.join(', ')}</strong>
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-[12px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-700 dark:border-red-900/30 dark:bg-red-900/15 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4" />
          <div>
            <div className="font-medium">{t('pdf.failed')}</div>
            <div className="mt-0.5 text-[12px] opacity-80">{error}</div>
            <Button onClick={generate} variant="link" size="sm" className="px-0">{t('pdf.retry')}</Button>
          </div>
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-[14px] border bg-[color:var(--ap-bg-sunken)]"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        {loading && !blobUrl && (
          <div className="flex h-[640px] flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Rendering preview…
          </div>
        )}
        {blobUrl && (
          <iframe
            title="Letter PDF preview"
            src={blobUrl}
            className="h-[720px] w-full bg-white"
          />
        )}
      </div>
    </div>
  )
}
