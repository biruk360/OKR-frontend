'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Bell,
  History,
  Download,
  MoveRight,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ActionsMenu, ConfirmDialog } from '@/components/ui'
import type { ActionsMenuItem } from '@/components/ui'

interface KeyResultActionsMenuProps {
  keyResult: any
  canEdit?: boolean
  canDelete?: boolean
  canClone?: boolean
  onEdit?: () => void
  onClone?: () => void
  onDelete?: () => void
  onCheckIn?: () => void
  /** Element id of the KR's chart (recharts SVG container). */
  chartElementId?: string
  /** Called after a successful action that needs list refresh. */
  onChanged?: () => void
  /**
   * When true, hides actions that already have their own inline buttons (Edit/Clone/
   * Archive/Delete/Check-in). Use this as the "overflow" menu alongside those buttons.
   */
  extrasOnly?: boolean
}

export default function KeyResultActionsMenu({
  keyResult,
  canEdit,
  canDelete,
  canClone,
  onEdit,
  onClone,
  onDelete,
  onCheckIn,
  chartElementId,
  onChanged,
  extrasOnly = false,
}: KeyResultActionsMenuProps) {
  const router = useRouter()
  const [completeOpen, setCompleteOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  const isArchived = keyResult.status === 'ARCHIVED'

  async function callEndpoint(
    path: string,
    loadingSetter: (v: boolean) => void,
    successMsg: string,
  ) {
    loadingSetter(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Request failed')
      toast.success(successMsg)
      onChanged?.()
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      loadingSetter(false)
    }
  }

  const downloadChart = async () => {
    if (!chartElementId) {
      toast('Chart not available for this key result')
      return
    }
    const node = document.getElementById(chartElementId)
    const svg = node?.querySelector('svg')
    if (!svg) {
      toast.error('No chart found to download')
      return
    }
    try {
      const serialized = new XMLSerializer().serializeToString(svg)
      const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load SVG'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      const box = svg.getBoundingClientRect()
      canvas.width = Math.max(800, Math.floor(box.width * 2))
      canvas.height = Math.max(400, Math.floor(box.height * 2))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${(keyResult.title || 'kr').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60)}-chart.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err: any) {
      toast.error(err.message || 'Chart download failed')
    }
  }

  const items: ActionsMenuItem[] = [
    {
      key: 'checkin',
      label: 'Check-in',
      icon: History,
      onSelect: () => onCheckIn?.(),
      hidden: extrasOnly || isArchived || !onCheckIn,
    },
    {
      key: 'edit',
      label: 'Edit',
      icon: Pencil,
      onSelect: () => onEdit?.(),
      hidden: extrasOnly || isArchived || !onEdit || !canEdit,
    },
    {
      key: 'clone',
      label: 'Clone',
      icon: Copy,
      onSelect: () => onClone?.(),
      hidden: extrasOnly || !onClone || !canClone,
    },
    {
      key: 'move',
      label: 'Move (coming soon)',
      icon: MoveRight,
      disabled: true,
      onSelect: () => {},
      hidden: isArchived,
    },
    {
      key: 'complete',
      label: 'Mark as completed',
      icon: CheckCircle2,
      onSelect: () => setCompleteOpen(true),
      hidden: isArchived,
    },
    {
      key: 'request-checkin',
      label: 'Request a check-in',
      icon: Bell,
      onSelect: () =>
        callEndpoint(
          `/api/keyresults/${keyResult.id}/request-checkin`,
          () => {},
          'Check-in requested from the owner.',
        ),
      hidden: isArchived,
    },
    { key: 'd1', label: '', divider: true, onSelect: () => {} },
    {
      key: 'audit',
      label: 'Audit log',
      icon: History,
      onSelect: () => {
        const el = document.getElementById(`kr-activity-${keyResult.id}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else toast('Audit log is available on the key result detail page')
      },
    },
    {
      key: 'download',
      label: 'Download chart',
      icon: Download,
      onSelect: downloadChart,
      hidden: !chartElementId,
    },
    { key: 'd2', label: '', divider: true, onSelect: () => {} },
    {
      key: 'archive',
      label: isArchived ? 'Restore from archive' : 'Archive',
      icon: isArchived ? ArchiveRestore : Archive,
      onSelect: () => {
        if (isArchived) {
          callEndpoint(
            `/api/keyresults/${keyResult.id}/unarchive`,
            setIsArchiving,
            'Key result restored.',
          )
        } else {
          setArchiveOpen(true)
        }
      },
      hidden: extrasOnly,
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onSelect: () => onDelete?.(),
      hidden: extrasOnly || !onDelete || !canDelete,
    },
  ]

  return (
    <>
      <ActionsMenu items={items} label="Key result actions" />

      <ConfirmDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={async () => {
          await callEndpoint(
            `/api/keyresults/${keyResult.id}/complete`,
            setIsCompleting,
            'Key result marked complete.',
          )
          setCompleteOpen(false)
        }}
        title="Mark key result complete?"
        message="This will set the current value to the target and progress to 100%."
        variant="info"
        confirmLabel="Mark complete"
        loadingLabel="Completing..."
        isLoading={isCompleting}
      />

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          await callEndpoint(
            `/api/keyresults/${keyResult.id}/archive`,
            setIsArchiving,
            'Key result archived.',
          )
          setArchiveOpen(false)
        }}
        title="Archive this key result?"
        message="Archived key results are excluded from progress calculations but can be restored."
        variant="warning"
        confirmLabel="Archive"
        loadingLabel="Archiving..."
        isLoading={isArchiving}
      />
    </>
  )
}
