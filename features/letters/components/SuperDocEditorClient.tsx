'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Save, AlertTriangle, Check } from 'lucide-react'
import type { FontConfig } from 'superdoc'
import { cn } from '@/lib/utils'
import { LETTER_FONTS } from '../i18n'

// SuperDoc's runtime depends on window/document, Vue, Pinia, and Konva.
// Loading it via a normal `import` from a Server Component file would crash
// the build. We isolate it behind an `import()` triggered inside useEffect so
// no SSR pass ever touches it. The CSS is also pulled in lazily.

interface Props {
  letterId: string
  /** URL the editor will fetch the initial .docx from (e.g. /api/letters/[id]/docx). */
  docxUrl: string
  /** When false, opens in read-only ("viewing") mode. */
  editable: boolean
  /** Currently-signed-in user — passed to SuperDoc for awareness/comment authorship. */
  user: { id: string; name: string; email: string }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const LETTER_EDITOR_FONT_STYLESHEET_ID = 'letter-editor-google-fonts'
const LETTER_EDITOR_FONT_STYLESHEET = [
  'https://fonts.googleapis.com/css2?',
  'family=Inter:wght@400;500;600;700',
  '&family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400',
  '&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400',
  '&family=Noto+Sans+Ethiopic:wdth,wght@75..125,100..900',
  '&family=Noto+Serif+Ethiopic:wdth,wght@75..125,100..900',
  '&family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400',
  '&family=Playfair+Display:ital,wght@0,400..900;1,400..900',
  '&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400',
  '&family=Roboto+Condensed:ital,wght@0,300;0,400;0,700;1,300;1,400',
  '&family=Roboto+Slab:wght@300;400;500;700',
  '&display=swap',
].join('')

const SUPERDOC_TOOLBAR_FONTS: FontConfig[] = LETTER_FONTS.map((font) => {
  const stack = `${font.id}, ${font.category}`
  return {
    label: font.id,
    key: stack,
    fontWeight: 400,
    props: {
      style: { fontFamily: stack },
      'data-item': 'btn-fontFamily-option',
    },
  }
})

// Keep this object stable: the React wrapper recreates SuperDoc when modules changes.
const SUPERDOC_MODULES = {
  toolbar: {
    fonts: SUPERDOC_TOOLBAR_FONTS,
  },
}

/**
 * Word-class editor wrapped around SuperDoc's React component.
 *
 * Lifecycle:
 *   1. mount → dynamic import of @superdoc-dev/react + superdoc/dist/style.css
 *   2. SuperDocEditor renders; we hold a ref to call .export() later
 *   3. on each editor update (debounced 2s), call superdoc.export() to get a
 *      .docx Blob, POST to /api/letters/[id]/docx
 *   4. unmount cancels in-flight saves
 */
export default function SuperDocEditorClient({ letterId, docxUrl, editable, user }: Props) {
  const [SuperDocEditor, setSuperDocEditor] = useState<any>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const editorRef = useRef<any>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const lastSavedAt = useRef<number>(0)
  // Suppress the first onEditorUpdate that fires immediately after the
  // initial document load — it's the editor settling, not a real user edit.
  const ignoreUpdatesUntil = useRef<number>(Date.now() + 1500)

  useEffect(() => {
    if (!document.getElementById(LETTER_EDITOR_FONT_STYLESHEET_ID)) {
      const link = document.createElement('link')
      link.id = LETTER_EDITOR_FONT_STYLESHEET_ID
      link.rel = 'stylesheet'
      link.href = LETTER_EDITOR_FONT_STYLESHEET
      document.head.appendChild(link)
    }

    let cancelled = false
    ;(async () => {
      try {
        // CSS first — failing to load it shouldn't block the editor, just style it badly.
        await import('superdoc/style.css').catch(() => {})
        const mod = await import('@superdoc-dev/react')
        if (cancelled) return
        setSuperDocEditor(() => mod.SuperDocEditor)
      } catch (err: any) {
        if (cancelled) return
        setLoadError(err?.message || 'Failed to load editor')
      }
    })()
    return () => {
      cancelled = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      inFlight.current?.abort()
    }
  }, [])

  async function persist() {
    const sd = editorRef.current?.getInstance()
    if (!sd) return
    setSaveState('saving')
    setSaveError(null)
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    try {
      // SuperDoc.export() with triggerDownload:false returns a Blob.
      const blob = await sd.export({ exportType: 'docx', triggerDownload: false })
      if (!blob) throw new Error('Export returned nothing')
      const res = await fetch(`/api/letters/${letterId}/docx`, {
        method: 'PUT',
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        body: blob,
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Save failed (${res.status})`)
      }
      lastSavedAt.current = Date.now()
      setSaveState('saved')
      // Reset to idle after a moment so the indicator doesn't hang forever.
      setTimeout(() => {
        if (Date.now() - lastSavedAt.current >= 1500) setSaveState('idle')
      }, 1800)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setSaveState('error')
      setSaveError(err?.message || 'Save failed')
    }
  }

  function scheduleSave() {
    if (!editable) return
    if (Date.now() < ignoreUpdatesUntil.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving') // optimistic
    saveTimer.current = setTimeout(() => { void persist() }, 2000)
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertTriangle className="mt-0.5 size-4" />
        <div>
          <div className="font-medium">Editor failed to load</div>
          <div className="text-xs opacity-80">{loadError}</div>
        </div>
      </div>
    )
  }
  if (!SuperDocEditor) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
        <Loader2 className="size-4 animate-spin" />
        Loading editor…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2 text-xs">
        <SaveIndicator state={saveState} error={saveError} onRetry={persist} editable={editable} />
      </div>
      <div className="overflow-hidden rounded-md border border-gray-200 bg-gray-100/40">
        <SuperDocEditor
          ref={editorRef}
          document={docxUrl}
          documentMode={editable ? 'editing' : 'viewing'}
          role={editable ? 'editor' : 'viewer'}
          user={{ id: user.id, name: user.name, email: user.email }}
          users={[{ id: user.id, name: user.name, email: user.email }]}
          modules={SUPERDOC_MODULES}
          onReady={() => {
            // Allow saves once the doc has loaded.
            ignoreUpdatesUntil.current = Date.now() + 1000
          }}
          onEditorUpdate={() => scheduleSave()}
          onContentError={(e: any) => {
            console.warn('[superdoc] content error', e)
            setSaveError(e?.error?.message || 'Document content error')
            setSaveState('error')
          }}
          onException={(e: any) => {
            console.warn('[superdoc] exception', e)
          }}
          style={{ minHeight: 640 }}
        />
      </div>
    </div>
  )
}

function SaveIndicator({
  state,
  error,
  onRetry,
  editable,
}: {
  state: SaveState
  error: string | null
  onRetry: () => void
  editable: boolean
}) {
  if (!editable) return <span className="text-gray-400">Read-only</span>
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-500">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-emerald-600')}>
        <Check className="size-3" /> Saved
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-2 text-red-600">
        <AlertTriangle className="size-3" /> {error || 'Save failed'}
        <button onClick={onRetry} className="underline">retry</button>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-400">
      <Save className="size-3" /> Up to date
    </span>
  )
}
