'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Bell,
  BellOff,
  History,
  Download,
  MoveRight,
  Scale,
  Trash2,
  LockKeyhole,
  RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ActionsMenu, ConfirmDialog } from '@/components/ui'
import type { ActionsMenuItem } from '@/components/ui'
import EditWeightsModal from './EditWeightsModal'
import CloseObjectiveModal from './CloseObjectiveModal'
import OkrReopenDialog from '@/components/shared/OkrReopenDialog'

function useWatcher(entityType: string, entityId: string) {
  const [watching, setWatching] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/watchers?mine=1`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setWatching(d.data.some((w: any) => w.entityType === entityType && w.entityId === entityId))
        }
      })
      .catch(() => {})
  }, [entityType, entityId])

  async function toggle() {
    setLoading(true)
    try {
      if (watching) {
        await fetch(`/api/watchers?entityType=${entityType}&entityId=${entityId}`, { method: 'DELETE' })
        setWatching(false)
        toast.success('Stopped watching')
      } else {
        await fetch('/api/watchers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, entityId }),
        })
        setWatching(true)
        toast.success('Watching — you\'ll be notified of changes')
      }
    } catch {
      toast.error('Failed to update watch status')
    } finally {
      setLoading(false)
    }
  }

  return { watching, loading, toggle }
}

interface ObjectiveActionsMenuProps {
  objective: any
  /** Called when the Edit action fires — parent opens the edit modal. */
  onEdit?: () => void
  /** Element id to scroll to when "Audit log" is picked. */
  auditLogElementId?: string
  /** Element id of the chart card — used by "Download chart" to render an image. */
  chartElementId?: string
  /** Called when the delete action fires — parent opens the delete modal. */
  onDelete?: () => void
}

/**
 * Single dropdown with every per-objective action. Edit/Delete are delegated to
 * the parent (they already have their own modal components); everything else
 * talks to the API directly. Move is stubbed — product direction TBD.
 */
export default function ObjectiveActionsMenu({
  objective,
  onEdit,
  auditLogElementId,
  chartElementId,
  onDelete,
}: ObjectiveActionsMenuProps) {
  const router = useRouter()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [weightsOpen, setWeightsOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [achievedShortcut, setAchievedShortcut] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const { watching, loading: watchLoading, toggle: toggleWatch } = useWatcher('OBJECTIVE', objective.id)

  const isArchived = objective.status === 'ARCHIVED'
  const isClosed = objective.closureStatus === 'CLOSED'

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
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Request failed')
      }
      toast.success(successMsg)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      loadingSetter(false)
    }
  }

  const scrollToAuditLog = () => {
    if (!auditLogElementId) {
      toast('Audit log not available on this view')
      return
    }
    const el = document.getElementById(auditLogElementId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const downloadChart = async () => {
    if (!chartElementId) {
      toast('Chart not available on this view')
      return
    }
    const node = document.getElementById(chartElementId)
    if (!node) return
    // Locate the embedded SVG (recharts renders one). Serialize + convert to PNG via canvas.
    const svg = node.querySelector('svg')
    if (!svg) {
      toast.error('No chart found to download')
      return
    }
    try {
      const serialized = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load SVG for export'))
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
      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `${(objective.title || 'objective').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60)}-progress.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err: any) {
      toast.error(err.message || 'Chart download failed')
    }
  }

  const items: ActionsMenuItem[] = [
    {
      key: 'edit',
      label: 'Edit',
      icon: Pencil,
      onSelect: () => onEdit?.(),
      hidden: isArchived || isClosed || !onEdit,
    },
    {
      key: 'move',
      label: 'Move (coming soon)',
      icon: MoveRight,
      disabled: true,
      onSelect: () => {},
      hidden: isArchived || isClosed,
    },
    {
      key: 'reopen',
      label: objective.reopenCount ? `Reopen (${objective.reopenCount} prior)` : 'Reopen objective',
      icon: RotateCcw,
      onSelect: () => setReopenOpen(true),
      hidden: !isClosed,
    },
    {
      key: 'close',
      label: objective.closureStatus === 'CLOSING' ? 'Continue closing' : 'Close objective',
      icon: LockKeyhole,
      onSelect: () => { setAchievedShortcut(false); setCloseOpen(true) },
      hidden: isArchived || objective.closureStatus === 'CLOSED',
    },
    {
      key: 'complete',
      label: 'Mark as completed',
      icon: CheckCircle2,
      onSelect: () => { setAchievedShortcut(true); setCloseOpen(true) },
      hidden: isArchived || objective.closureStatus !== 'OPEN',
    },
    {
      key: 'request-checkin',
      label: 'Request a check-in',
      icon: Bell,
      onSelect: () =>
        callEndpoint(
          `/api/objectives/${objective.id}/request-checkin`,
          () => {},
          'Check-in requested from the owner.',
        ),
      hidden: isArchived || isClosed,
    },
    {
      key: 'weights',
      label: 'Edit weights',
      icon: Scale,
      onSelect: () => setWeightsOpen(true),
      hidden: isArchived || isClosed,
    },
    {
      key: 'watch',
      label: watching ? 'Unwatch' : 'Watch',
      icon: watching ? BellOff : Bell,
      disabled: watchLoading,
      onSelect: toggleWatch,
    },
    { key: 'd1', label: '', divider: true, onSelect: () => {} },
    {
      key: 'audit',
      label: 'Audit log',
      icon: History,
      onSelect: scrollToAuditLog,
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
            `/api/objectives/${objective.id}/unarchive`,
            setIsArchiving,
            'Objective restored.',
          )
        } else {
          setArchiveOpen(true)
        }
      },
      hidden: isClosed,
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onSelect: () => onDelete?.(),
      hidden: isClosed || !onDelete,
    },
  ]

  return (
    <>
      <ActionsMenu items={items} label="Objective actions" />

      <CloseObjectiveModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        objective={objective}
        achievedShortcut={achievedShortcut}
        onInitiated={() => router.refresh()}
      />

      <OkrReopenDialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        entity={objective}
        entityType="objective"
        onReopened={() => router.refresh()}
      />

      <EditWeightsModal
        open={weightsOpen}
        onClose={() => setWeightsOpen(false)}
        objectiveId={objective.id}
        objectiveTitle={objective.title}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          await callEndpoint(
            `/api/objectives/${objective.id}/archive`,
            setIsArchiving,
            'Objective archived.',
          )
          setArchiveOpen(false)
        }}
        title="Archive this objective?"
        message="Archiving hides the objective and its key results from active views."
        description="Initiatives stay attached. You can restore later from Archived Objectives."
        variant="warning"
        confirmLabel="Archive"
        loadingLabel="Archiving..."
        isLoading={isArchiving}
      />
    </>
  )
}
