'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, FileDown, Printer, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { generateLetterPdf } from '../services/lettersApi'

interface Props {
  letterId: string
  canPrint: boolean
}

export default function PdfPreviewPanel({ letterId, canPrint }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Free the blob URL when it's replaced or the component unmounts. Without this
  // each "Regenerate" leaks a few hundred KB to the JS heap.
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  async function generate(): Promise<string | null> {
    setLoading(true)
    setError(null)
    try {
      const data = await generateLetterPdf(letterId)
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

  async function print() {
    const url = blobUrl ?? (await generate())
    if (!url) return
    const win = window.open(url, '_blank')
    if (!win) return
    // The print dialog must run after the PDF viewer has loaded.
    win.addEventListener('load', () => win.print())
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={generate} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`} />
          {blobUrl ? 'Regenerate Preview' : 'Generate PDF Preview'}
        </Button>
        {canPrint && (
          <Button onClick={print} variant="outline" size="sm" disabled={loading}>
            <Printer className="mr-1.5 size-3.5" /> Print
          </Button>
        )}
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4" />
          <div>
            <div className="font-medium">{error}</div>
            <Button onClick={generate} variant="link" size="sm" className="px-0">
              Retry
            </Button>
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4" />
          <span>
            Unresolved placeholders: <strong>{missing.join(', ')}</strong>. They appear in the preview as
            <code className="mx-1 rounded bg-amber-100 px-1">[MISSING]</code> markers.
          </span>
        </div>
      )}
      {blobUrl ? (
        <iframe
          title="Letter PDF preview"
          src={blobUrl}
          className="h-[640px] w-full rounded-md border border-gray-200 bg-white"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
          <FileDown className="size-6 text-gray-400" />
          <span>Click <strong>Generate PDF Preview</strong> to render the letter.</span>
        </div>
      )}
    </div>
  )
}
