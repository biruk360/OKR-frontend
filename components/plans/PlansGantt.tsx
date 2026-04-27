'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { gantt, type GanttStatic } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import type { GanttPayload, GanttTask } from '@/app/api/gantt/route'
import { EmptyState } from '@/components/ui/EmptyState'

type ZoomLevel = 'week' | 'month' | 'quarter' | 'year'

const STATUS_BAR_COLOR: Record<string, string> = {
  ON_TRACK: '#34c759',
  AT_RISK: '#ff9500',
  OFF_TRACK: '#ff3b30',
  CLOSED: '#8e8e93',
}

const CONFIDENCE_BAR_COLOR: Record<string, string> = {
  ON_TRACK: '#34c759',
  AT_RISK: '#ff9500',
  OFF_TRACK: '#ff3b30',
}

function applyZoom(g: GanttStatic, level: ZoomLevel) {
  const config = g.config as unknown as { scales: unknown; scale_height: number }
  switch (level) {
    case 'week':
      config.scales = [
        { unit: 'month', step: 1, format: '%F %Y' },
        { unit: 'week', step: 1, format: 'Wk %W' },
        { unit: 'day', step: 1, format: '%d' },
      ]
      break
    case 'month':
      config.scales = [
        { unit: 'year', step: 1, format: '%Y' },
        { unit: 'month', step: 1, format: '%F' },
        { unit: 'week', step: 1, format: 'W%W' },
      ]
      break
    case 'quarter':
      config.scales = [
        { unit: 'year', step: 1, format: '%Y' },
        { unit: 'quarter', step: 1, format: (d: Date) => `Q${Math.floor(d.getMonth() / 3) + 1}` },
        { unit: 'month', step: 1, format: '%M' },
      ]
      break
    case 'year':
      config.scales = [
        { unit: 'year', step: 1, format: '%Y' },
        { unit: 'quarter', step: 1, format: (d: Date) => `Q${Math.floor(d.getMonth() / 3) + 1}` },
      ]
      break
  }
  config.scale_height = 60
}

export default function PlansGantt() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const ganttRef = useRef<GanttStatic | null>(null)
  const router = useRouter()
  const [zoom, setZoom] = useState<ZoomLevel>('quarter')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const g = gantt
    ganttRef.current = g

    g.config.date_format = '%Y-%m-%d %H:%i'
    g.config.readonly = true
    g.config.drag_progress = false
    g.config.drag_move = false
    g.config.drag_resize = false
    g.config.drag_links = false
    g.config.open_tree_initially = true
    g.config.row_height = 38
    g.config.bar_height = 22
    ;(g.config as unknown as { round_dnd_dates: boolean }).round_dnd_dates = false

    g.config.columns = [
      {
        name: 'text',
        label: 'Objective / Key Result',
        tree: true,
        width: 340,
        resize: true,
        template: (raw: unknown) => {
          const task = raw as GanttTask
          const prefix =
            task.entityType === 'keyresult'
              ? '<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;background:#dbeafe;color:#1d4ed8;margin-right:6px;vertical-align:middle;">KR</span>'
              : task.level
              ? `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;background:#f1f5f9;color:#475569;margin-right:6px;vertical-align:middle;">${task.level.slice(0, 3)}</span>`
              : ''
          return `${prefix}<span title="${escapeHtml(task.text)}">${escapeHtml(task.text)}</span>`
        },
      },
      {
        name: 'owner',
        label: 'Assignee',
        align: 'left',
        width: 140,
        template: (raw: unknown) => {
          const task = raw as GanttTask
          const initials = (task.owner || '—')
            .split(' ')
            .map((s) => s[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase()
          const avatar = task.ownerAvatar
            ? `<img src="${escapeHtml(task.ownerAvatar)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;margin-right:6px;vertical-align:middle;" />`
            : `<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#e2e8f0;color:#475569;font-size:10px;font-weight:600;margin-right:6px;vertical-align:middle;">${escapeHtml(initials || '—')}</span>`
          return `${avatar}<span style="vertical-align:middle;font-size:12px;">${escapeHtml(task.owner)}</span>`
        },
      },
      {
        name: 'status',
        label: 'Status',
        align: 'center',
        width: 90,
        template: (raw: unknown) => {
          const task = raw as GanttTask
          if (task.entityType === 'objective' && task.goalStatus) {
            const color = STATUS_BAR_COLOR[task.goalStatus] ?? '#94a3b8'
            return `<span style="display:inline-block;padding:2px 6px;border-radius:10px;background:${color};color:white;font-size:10px;font-weight:600;">${task.goalStatus.replace(/_/g, ' ')}</span>`
          }
          if (task.entityType === 'keyresult' && task.confidence) {
            const color = CONFIDENCE_BAR_COLOR[task.confidence] ?? '#94a3b8'
            return `<span style="display:inline-block;padding:2px 6px;border-radius:10px;background:${color};color:white;font-size:10px;font-weight:600;">${task.confidence.replace(/_/g, ' ')}</span>`
          }
          return ''
        },
      },
      {
        name: 'progress',
        label: 'Progress',
        align: 'center',
        width: 80,
        template: (raw: unknown) => {
          const task = raw as GanttTask
          const pct = Math.round((task.progress || 0) * 100)
          const extra =
            task.entityType === 'keyresult' && task.unit && task.targetValue != null
              ? ` <span style="color:#64748b;font-size:10px;">${task.currentValue ?? 0}/${task.targetValue} ${task.unit}</span>`
              : ''
          return `<span style="font-size:12px;font-weight:600;">${pct}%</span>${extra}`
        },
      },
    ]

    g.templates.task_class = (_start: Date, _end: Date, task: unknown) => {
      const t = task as GanttTask
      const status = (t.goalStatus || t.confidence || '') as string
      const tone =
        status === 'ON_TRACK' ? 'ap-bar-green' :
        status === 'AT_RISK' ? 'ap-bar-amber' :
        status === 'OFF_TRACK' ? 'ap-bar-red' :
        status === 'CLOSED' ? 'ap-bar-gray' : 'ap-bar-blue'
      const kind = t.entityType === 'objective' ? 'ap-bar-objective' : 'ap-bar-kr'
      return `ap-bar ${kind} ${tone}`
    }

    g.templates.task_text = (_start: Date, _end: Date, task: unknown) => {
      const t = task as GanttTask
      const pct = Math.round((t.progress || 0) * 100)
      return `${escapeHtml(t.text)} — ${pct}%`
    }

    g.templates.tooltip_text = (_start: Date, _end: Date, task: unknown) => {
      const t = task as GanttTask
      const lines: string[] = []
      lines.push(`<b>${escapeHtml(t.text)}</b>`)
      lines.push(`Type: ${t.entityType === 'objective' ? 'Objective' : 'Key Result'}`)
      if (t.level) lines.push(`Level: ${t.level}`)
      if (t.department) lines.push(`Department: ${escapeHtml(t.department)}`)
      lines.push(`Owner: ${escapeHtml(t.owner)}`)
      lines.push(`Progress: ${Math.round((t.progress || 0) * 100)}%`)
      if (t.goalStatus) lines.push(`Status: ${t.goalStatus.replace(/_/g, ' ')}`)
      if (t.confidence) lines.push(`Confidence: ${t.confidence.replace(/_/g, ' ')}`)
      if (t.entityType === 'keyresult' && t.unit && t.targetValue != null) {
        lines.push(`Target: ${t.currentValue ?? 0} / ${t.targetValue} ${t.unit}`)
      }
      lines.push(`${t.start_date} → ${t.end_date}`)
      return lines.join('<br/>')
    }

    g.plugins({ tooltip: true, marker: true })

    applyZoom(g, 'quarter')
    g.init(containerRef.current)

    const onTaskClick = g.attachEvent(
      'onTaskClick',
      (id: string) => {
        const task = g.getTask(id) as unknown as GanttTask
        if (!task) return true
        if (task.entityType === 'objective') {
          router.push(`/dashboard/objectives/${task.entityId}`)
        } else {
          router.push(`/dashboard/key-results/${task.entityId}`)
        }
        return false
      },
      {}
    )

    const markerId = g.addMarker?.({
      start_date: new Date(),
      css: 'today-marker',
      text: 'Today',
      title: new Date().toLocaleDateString(),
    })

    fetch('/api/gantt', { cache: 'no-store' })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to load')
        const payload = res.data as GanttPayload
        if (payload.data.length === 0) {
          setEmpty(true)
          setLoading(false)
          return
        }
        g.clearAll()
        g.parse(payload)
        setLoading(false)
      })
      .catch((e) => {
        setError(e?.message ?? 'Failed to load gantt data')
        setLoading(false)
      })

    return () => {
      if (typeof onTaskClick === 'string' || typeof onTaskClick === 'number') {
        g.detachEvent(String(onTaskClick))
      }
      if (markerId) g.deleteMarker?.(markerId)
      g.clearAll()
    }
  }, [router])

  useEffect(() => {
    const g = ganttRef.current
    if (!g) return
    applyZoom(g, zoom)
    g.render()
  }, [zoom])

  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{
        background: 'var(--ap-bg, #fff)',
        borderColor: 'var(--ap-border, hsl(var(--border)))',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b"
        style={{
          borderColor: 'var(--ap-border, hsl(var(--border)))',
          background: 'rgba(120,120,128,0.04)',
        }}
      >
        <div className="flex items-center gap-3 text-[11px]">
          <LegendDot color="#34c759" label="On track" />
          <LegendDot color="#ff9500" label="At risk" />
          <LegendDot color="#ff3b30" label="Off track" />
          <LegendDot color="#8e8e93" label="Closed" />
        </div>
        <div
          className="inline-flex h-8 items-center gap-0.5 rounded-[10px] p-0.5"
          style={{ background: 'rgba(120,120,128,0.08)' }}
        >
          {(['week', 'month', 'quarter', 'year'] as ZoomLevel[]).map((z) => {
            const active = zoom === z
            return (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className="h-7 px-2.5 text-[11px] font-medium rounded-[8px] transition-all"
                style={{
                  background: active ? 'var(--ap-accent, #007aff)' : 'transparent',
                  color: active ? '#fff' : 'var(--ap-fg-muted, hsl(var(--muted-foreground)))',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {z[0].toUpperCase() + z.slice(1)}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ap-red, #ff3b30)' }}>
          Failed to load: {error}
        </div>
      )}
      {empty && !error && (
        <div className="py-2">
          <EmptyState
            bare
            title="No plans to show"
            description="No active objectives with a timeframe to display."
          />
        </div>
      )}
      {loading && !error && !empty && (
        <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
          Loading…
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 'calc(100vh - 220px)',
          minHeight: '520px',
          display: error || empty ? 'none' : 'block',
        }}
      />

      <style jsx global>{`
        .gantt_task_line.ap-bar {
          border-radius: 11px !important;
          border: none !important;
          height: 22px !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        }
        .gantt_task_line.ap-bar .gantt_task_progress {
          border-radius: 11px 0 0 11px;
          background: rgba(255, 255, 255, 0.32) !important;
        }
        .gantt_task_line.ap-bar .gantt_task_content {
          color: #fff;
          font-weight: 600;
          font-size: 11px;
          line-height: 22px;
        }
        .gantt_task_line.ap-bar-kr {
          height: 18px !important;
          border-radius: 9px !important;
        }
        .gantt_task_line.ap-bar-kr .gantt_task_progress {
          border-radius: 9px 0 0 9px;
        }
        .gantt_task_line.ap-bar-kr .gantt_task_content {
          font-size: 10px;
          line-height: 18px;
        }
        .gantt_task_line.ap-bar-blue { background: #007aff !important; }
        .gantt_task_line.ap-bar-green { background: #34c759 !important; }
        .gantt_task_line.ap-bar-amber { background: #ff9500 !important; }
        .gantt_task_line.ap-bar-red { background: #ff3b30 !important; }
        .gantt_task_line.ap-bar-gray { background: #8e8e93 !important; }

        .gantt_task_cell,
        .gantt_grid_data .gantt_row,
        .gantt_grid_scale .gantt_grid_head_cell,
        .gantt_task_row,
        .gantt_scale_cell,
        .gantt_scale_line {
          border-color: var(--ap-border, #e5e5ea) !important;
        }
        .gantt_task_row.odd,
        .gantt_grid_data .gantt_row.odd {
          background: rgba(120, 120, 128, 0.04) !important;
        }
        .gantt_task_row.gantt_selected,
        .gantt_grid_data .gantt_row.gantt_selected {
          background: rgba(0, 122, 255, 0.06) !important;
        }
        .gantt_grid_scale,
        .gantt_scale_line {
          background: rgba(120, 120, 128, 0.04) !important;
        }
        .gantt_grid_head_cell,
        .gantt_scale_cell {
          color: var(--ap-fg-muted, #6b7280) !important;
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .today-marker {
          background: var(--ap-accent, #007aff);
          width: 2px;
        }
        .today-marker .gantt_marker_content {
          background: var(--ap-accent, #007aff);
          color: white;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 6px;
        }

        .gantt_tooltip {
          background: #fff !important;
          color: var(--ap-fg, #111) !important;
          border: 1px solid var(--ap-border, #e5e5ea) !important;
          border-radius: 10px !important;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.10) !important;
          padding: 10px 12px !important;
          font-size: 12px !important;
          line-height: 1.5 !important;
        }
      `}</style>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span
        className="inline-block w-2.5 h-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
