'use client'

import { useRef, useState } from 'react'
import { Trash2, Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui'
import type { LetterEnclosureWithUploader } from '../types'
import { addEnclosure, removeEnclosure } from '../services/lettersApi'

interface Props {
  letterId: string
  enclosures: LetterEnclosureWithUploader[]
  canEdit: boolean
  onChange: (next: LetterEnclosureWithUploader[]) => void
}

const ACCEPT =
  '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg'

export default function EnclosuresPanel({ letterId, enclosures, canEdit, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      // Vertical-slice: we don't actually upload bytes anywhere — we just
      // register the metadata so the workflow & activity log are complete.
      // Wire to real object storage when that lands.
      const next: LetterEnclosureWithUploader[] = [...enclosures]
      for (const f of Array.from(files)) {
        const created = await addEnclosure(letterId, {
          fileName: f.name,
          fileSize: f.size,
          mimeType: f.type || 'application/octet-stream',
        })
        next.unshift(created)
      }
      onChange(next)
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(enclosureId: string) {
    setError(null)
    try {
      await removeEnclosure(letterId, enclosureId)
      onChange(enclosures.filter((e) => e.id !== enclosureId))
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    }
  }

  const totalBytes = enclosures.reduce((s, e) => s + e.fileSize, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{enclosures.length} file(s) — {formatBytes(totalBytes)}</p>
        {canEdit && (
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload className="mr-1.5 size-3.5" />
              {uploading ? 'Uploading…' : 'Add files'}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {enclosures.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No enclosures attached yet.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {enclosures.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-4 text-gray-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{e.fileName}</div>
                <div className="text-xs text-gray-500">
                  {formatBytes(e.fileSize)} · {e.uploadedBy.name} · {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(e.id)}
                  className="text-gray-400 hover:text-red-600"
                  aria-label={`Delete ${e.fileName}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
