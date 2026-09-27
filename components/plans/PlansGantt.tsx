'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { gantt, type GanttStatic } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import type { GanttPayload, GanttTask } from '@/app/api/gantt/route'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { getConfidenceColor } from '@/lib/utils'
import { STATUS_CHART_COLOR, chartColors } from '@/lib/chart-colors'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTimeframes } from '@/hooks/useTimeframes'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import { differenceInCalendarDays, format as formatDate } from 'date-fns'

/** `/api/gantt?timeframeId=all` — every timeframe (the API defaults to the active one). */
const ALL_TIMEFRAMES = 'all'

type ZoomLevel = 'week' | 'month' | 'quarter' | 'year'

/** Theme-aware (CSS variable) status colours — see lib/chart-colors.ts. */
const STATUS_BAR_COLOR = STATUS_CHART_COLOR

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
  // undefined → the API's default (the active timeframe, lib/okr/active-timeframe.ts).
  const [timeframeId, setTimeframeId] = useState<string | undefined>(undefined)
  const { timeframes } = useTimeframes()
  // Mirror the server default so the picker names the timeframe being shown.
  const defaultTimeframe = useMemo(() => {
    const active = timeframes.filter((t) => t.isActive)
    return pickCurrentTimeframe(active.length > 0 ? active : timeframes)
  }, [timeframes])
  const timeframeOptions = useMemo(
    () => [
      { value: ALL_TIMEFRAMES, label: 'All timeframes' },
      ...timeframes.map((t) => ({ value: t.id, label: t.name })),
    ],
    [timeframes],
  )

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
              ? '<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;background:var(--ap-accent-soft);color:var(--ap-accent-on-soft);margin-right:6px;vertical-align:middle;">KR</span>'
              : task.level
              ? `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;background:var(--ap-bg-sunken);color:var(--ap-fg-secondary);margin-right:6px;vertical-align:middle;">${task.level.slice(0, 3)}</span>`
              : ''
          return `${prefix}<span>${escapeHtml(task.text)}</span>`
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
            : `<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:var(--ap-bg-hover);color:var(--ap-fg-secondary);font-size:10px;font-weight:600;margin-right:6px;vertical-align:middle;">${escapeHtml(initials || '—')}</span>`
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
            const color = STATUS_BAR_COLOR[task.goalStatus] ?? chartColors.neutral
            return `<span style="display:inline-block;padding:2px 6px;border-radius:10px;background:${color};color:var(--ap-accent-fg);font-size:10px;font-weight:600;">${task.goalStatus.replace(/_/g, ' ')}</span>`
          }
          if (task.entityType === 'keyresult' && task.confidence) {
            const color = getConfidenceColor(task.confidence)
            return `<span style="display:inline-block;padding:2px 6px;border-radius:10px;background:${color};color:var(--ap-accent-fg);font-size:10px;font-weight:600;">${task.confidence.replace(/_/g, ' ')}</span>`
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
              ? ` <span style="color:var(--ap-fg-subtle);font-size:10px;">${task.currentValue ?? 0}/${task.targetValue} ${task.unit}</span>`
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

    g.templates.tooltip_text = (start: Date, end: Date, task: unknown) => {
      const t = task as GanttTask
      const pct = Math.round((t.progress || 0) * 100)
      const status = (t.goalStatus || t.confidence || '') as string
      const tone =
        status === 'ON_TRACK' ? 'on' :
        status === 'AT_RISK' ? 'risk' :
        status === 'OFF_TRACK' ? 'off' :
        status === 'CLOSED' ? 'closed' : 'none'
      const kind = t.entityType === 'objective' ? (t.level ? t.level.slice(0, 3) : 'OBJ') : 'KR'
      const sameYear = start.getFullYear() === end.getFullYear()
      const range = `${formatDate(start, sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${formatDate(end, 'MMM d, yyyy')}`
      const days = Math.max(1, differenceInCalendarDays(end, start))
      const rows: string[] = [`<div class="ap-tt-row"><span>Owner</span><b>${escapeHtml(t.owner)}</b></div>`]
      if (t.department) rows.push(`<div class="ap-tt-row"><span>Team</span><b>${escapeHtml(t.department)}</b></div>`)
      if (t.entityType === 'keyresult' && t.targetValue != null) {
        rows.push(`<div class="ap-tt-row"><span>Target</span><b>${t.currentValue ?? 0} / ${t.targetValue}${t.unit ? ` ${escapeHtml(t.unit)}` : ''}</b></div>`)
      }
      rows.push(`<div class="ap-tt-row"><span>Dates</span><b>${range} · ${days}d</b></div>`)
      return `<div class="ap-tt">
        <div class="ap-tt-head"><span class="ap-tt-kind">${kind}</span>${status ? `<span class="ap-tt-status ap-tt-${tone}">${escapeHtml(status.replace(/_/g, ' ').toLowerCase())}</span>` : ''}</div>
        <div class="ap-tt-title">${escapeHtml(t.text)}</div>
        <div class="ap-tt-progress"><div class="ap-tt-bar"><i class="ap-tt-${tone}" style="width:${pct}%"></i></div><b>${pct}%</b></div>
        ${rows.join('')}
      </div>`
    }

    // Small delay so sweeping the cursor across rows doesn't flash a card per row.
    ;(g.config as unknown as { tooltip_timeout: number; tooltip_offset_x: number; tooltip_offset_y: number }).tooltip_timeout = 250
    ;(g.config as unknown as { tooltip_offset_x: number }).tooltip_offset_x = 14
    ;(g.config as unknown as { tooltip_offset_y: number }).tooltip_offset_y = 18

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

    // dhtmlx sets a native `title` on grid cells; with the tooltip plugin that
    // showed two tooltips at once (the gray "KRMaintain…" one). Remove them.
    const stripTitles = () => {
      containerRef.current?.querySelectorAll('.gantt_grid [title], .gantt_task_line[title]').forEach((el) => el.removeAttribute('title'))
    }
    const onRender = g.attachEvent('onGanttRender', stripTitles, {})
    const onDataRender = g.attachEvent('onDataRender', stripTitles, {})

    const markerId = g.addMarker?.({
      start_date: new Date(),
      css: 'today-marker',
      text: 'Today',
      title: new Date().toLocaleDateString(),
    })

    return () => {
      if (typeof onTaskClick === 'string' || typeof onTaskClick === 'number') {
        g.detachEvent(String(onTaskClick))
      }
      for (const ev of [onRender, onDataRender]) {
        if (typeof ev === 'string' || typeof ev === 'number') g.detachEvent(String(ev))
      }
      if (markerId) g.deleteMarker?.(markerId)
      g.clearAll()
    }
  }, [router])

  // Load (and reload on timeframe change) after the chart is initialised above.
  useEffect(() => {
    const g = ganttRef.current
    if (!g) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setEmpty(false)
    const qs = timeframeId ? `?timeframeId=${encodeURIComponent(timeframeId)}` : ''
    fetch(`/api/gantt${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return
        if (!res.success) throw new Error(res.error || 'Failed to load')
        const payload = res.data as GanttPayload
        g.clearAll()
        if (payload.data.length === 0) {
          setEmpty(true)
          setLoading(false)
          return
        }
        g.parse(payload)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message ?? 'Failed to load gantt data')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [timeframeId])

  useEffect(() => {
    const g = ganttRef.current
    if (!g) return
    applyZoom(g, zoom)
    g.render()
  }, [zoom])

  return (
    <div
      className="rounded-[var(--ap-radius-md)] border overflow-hidden"
      style={{
        background: 'var(--ap-bg)',
        borderColor: 'var(--ap-border)',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b"
        style={{
          borderColor: 'var(--ap-border)',
          background: 'var(--ap-bg-sunken)',
        }}
      >
        <div className="flex flex-wrap items-center gap-3 text-caption">
          <FilterSelect
            label="Timeframe"
            value={timeframeId ?? defaultTimeframe?.id}
            onValueChange={setTimeframeId}
            options={timeframeOptions}
            placeholder="Current timeframe"
            clearable={timeframeId !== undefined}
            menuWidth={220}
          />
          <LegendDot color={chartColors.success} label="On track" />
          <LegendDot color={chartColors.warning} label="At risk" />
          <LegendDot color={chartColors.danger} label="Off track" />
          <LegendDot color={chartColors.neutral} label="Closed" />
        </div>
        <div
          role="group"
          aria-label="Zoom level"
          className="inline-flex h-8 items-center gap-0.5 rounded-[var(--ap-radius-sm)] p-0.5"
          style={{ background: 'var(--ap-bg-hover)' }}
        >
          {(['week', 'month', 'quarter', 'year'] as ZoomLevel[]).map((z) => {
            const active = zoom === z
            return (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                aria-pressed={active}
                className="h-7 px-2.5 text-caption font-medium rounded-[8px] transition-all"
                style={{
                  background: active ? 'var(--ap-accent)' : 'transparent',
                  color: active ? 'var(--ap-accent-fg)' : 'var(--ap-fg-muted)',
                  boxShadow: active ? 'var(--ap-shadow-sm)' : 'none',
                }}
              >
                {z[0].toUpperCase() + z.slice(1)}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div role="alert" className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ap-red)' }}>
          Failed to load: {error}
        </div>
      )}
      {empty && !error && (
        <div className="py-2">
          <EmptyState
            bare
            title="No plans to show"
            description={
              timeframeId === ALL_TIMEFRAMES
                ? 'No active objectives with a timeframe to display.'
                : 'No active objectives in this timeframe. Try “All timeframes”.'
            }
          />
        </div>
      )}
      {loading && !error && !empty && (
        <div className="space-y-2 px-4 py-4" aria-busy="true" aria-label="Loading plans">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
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
          color: var(--ap-accent-fg);
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
        .gantt_task_line.ap-bar-blue { background: var(--ap-accent) !important; }
        .gantt_task_line.ap-bar-green { background: var(--ap-green) !important; }
        .gantt_task_line.ap-bar-amber { background: var(--ap-orange) !important; }
        .gantt_task_line.ap-bar-red { background: var(--ap-red) !important; }
        .gantt_task_line.ap-bar-gray { background: var(--ap-none) !important; }

        .gantt_task_cell,
        .gantt_grid_data .gantt_row,
        .gantt_grid_scale .gantt_grid_head_cell,
        .gantt_task_row,
        .gantt_scale_cell,
        .gantt_scale_line {
          border-color: var(--ap-border) !important;
        }
        .gantt_task_row.odd,
        .gantt_grid_data .gantt_row.odd {
          background: rgba(120, 120, 128, 0.04) !important;
        }
        .gantt_task_row.gantt_selected,
        .gantt_grid_data .gantt_row.gantt_selected {
          background: color-mix(in oklch, var(--ap-accent) 6%, transparent) !important;
        }
        .gantt_grid_scale,
        .gantt_scale_line {
          background: rgba(120, 120, 128, 0.04) !important;
        }
        .gantt_grid_head_cell,
        .gantt_scale_cell {
          color: var(--ap-fg-muted) !important;
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .today-marker {
          background: var(--ap-accent);
          width: 2px;
        }
        .today-marker .gantt_marker_content {
          background: var(--ap-accent);
          color: var(--ap-accent-fg);
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 6px;
        }

        .gantt_tooltip {
          max-width: 320px !important;
          width: max-content !important;
          white-space: normal !important;
          background: var(--ap-bg-raised) !important;
          color: var(--ap-fg) !important;
          border: 1px solid var(--ap-border) !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14) !important;
          padding: 12px 14px !important;
          font-size: 12px !important;
          line-height: 1.4 !important;
          font-style: normal !important;
          z-index: 60 !important;
        }
        .ap-tt { display: flex; flex-direction: column; gap: 6px; }
        .ap-tt-head { display: flex; align-items: center; gap: 6px; }
        .ap-tt-kind {
          font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
          padding: 1px 6px; border-radius: 5px;
          background: var(--ap-accent-soft); color: var(--ap-accent-on-soft);
        }
        .ap-tt-status {
          font-size: 10px; font-weight: 600; text-transform: capitalize;
          padding: 1px 8px; border-radius: 999px; color: var(--ap-accent-fg);
        }
        .ap-tt-title {
          font-size: 13px; font-weight: 600; color: var(--ap-fg);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .ap-tt-progress { display: flex; align-items: center; gap: 8px; }
        .ap-tt-progress b { font-size: 12px; font-variant-numeric: tabular-nums; }
        .ap-tt-bar { flex: 1; height: 6px; border-radius: 999px; background: var(--ap-bg-sunken); overflow: hidden; }
        .ap-tt-bar i { display: block; height: 100%; border-radius: 999px; }
        .ap-tt-row { display: flex; justify-content: space-between; gap: 12px; font-size: 11.5px; }
        .ap-tt-row span { color: var(--ap-fg-subtle); flex-shrink: 0; }
        .ap-tt-row b { font-weight: 500; text-align: right; color: var(--ap-fg-secondary); }
        .ap-tt-on { background: var(--ap-green); }
        .ap-tt-risk { background: var(--ap-orange); }
        .ap-tt-off { background: var(--ap-red); }
        .ap-tt-closed, .ap-tt-none { background: var(--ap-fg-subtle); }
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
