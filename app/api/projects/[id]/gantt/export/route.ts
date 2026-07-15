import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { renderHtmlToPdf, renderHtmlToPng } from '@/lib/letter-pdf-puppeteer'
import { getReadableProject } from '@/lib/projects/access'

type ExportFormat = 'pdf' | 'png' | 'csv' | 'xml'

interface ExportRow {
  id: string
  title: string
  type: 'phase' | 'milestone' | 'activity'
  status: string
  ownerParty: string | null
  currentStart: Date | null
  currentEnd: Date | null
  baselineStart: Date | null
  baselineEnd: Date | null
  percentComplete: number
  depth: number
}

export const runtime = 'nodejs'

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
    return exists ? apiForbidden() : apiNotFound('Project not found')
  }

  const format = (req.nextUrl.searchParams.get('format') || 'pdf').toLowerCase()
  if (!['pdf', 'png', 'csv', 'xml'].includes(format)) return apiBadRequest('Unsupported export format')

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      phases: {
        orderBy: { position: 'asc' },
        include: {
          milestones: {
            orderBy: { position: 'asc' },
            include: { activities: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  })
  if (!project) return apiNotFound('Project not found')

  const rows = flattenRows(project.phases)
  const fileBase = safeFileName(`${project.code || project.id}-gantt`)

  if (format === 'csv') {
    return textDownload(toCsv(rows), 'text/csv; charset=utf-8', `${fileBase}.csv`)
  }
  if (format === 'xml') {
    return textDownload(toMsProjectXml(project.name, rows), 'application/xml; charset=utf-8', `${fileBase}.xml`)
  }

  try {
    const html = renderGanttExportHtml(project, rows)
    if (format === 'png') {
      const png = await renderHtmlToPng({ html, width: 1800, height: 1100 })
      return binaryDownload(png, 'image/png', `${fileBase}.png`)
    }
    const pdf = await renderHtmlToPdf({ html, landscape: true })
    return binaryDownload(pdf, 'application/pdf', `${fileBase}.pdf`)
  } catch (err) {
    return apiError('Gantt export generation failed', {
      status: 500,
      code: 'GANTT_EXPORT_FAILED',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})

function flattenRows(phases: Array<any>): ExportRow[] {
  const rows: ExportRow[] = []
  for (const phase of phases) {
    const phaseActivities = phase.milestones.flatMap((m: any) => m.activities)
    const phaseCurrent = span(phaseActivities, 'current') ?? { start: phase.currentStart, end: phase.currentEnd }
    const phaseBaseline = span(phaseActivities, 'baseline') ?? { start: phase.baselineStart, end: phase.baselineEnd }
    rows.push({
      id: phase.id,
      title: phase.name,
      type: 'phase',
      status: phase.status,
      ownerParty: null,
      currentStart: phaseCurrent.start,
      currentEnd: phaseCurrent.end,
      baselineStart: phaseBaseline.start,
      baselineEnd: phaseBaseline.end,
      percentComplete: phase.percentComplete,
      depth: 0,
    })
    for (const milestone of phase.milestones) {
      rows.push({
        id: milestone.id,
        title: milestone.name,
        type: 'milestone',
        status: milestone.status,
        ownerParty: null,
        currentStart: milestone.currentDate,
        currentEnd: milestone.currentDate,
        baselineStart: milestone.baselineDate,
        baselineEnd: milestone.baselineDate,
        percentComplete: milestone.percentComplete,
        depth: 1,
      })
      const topActivities = milestone.activities.filter((a: any) => !a.parentActivityId)
      for (const activity of topActivities) pushActivity(rows, activity, milestone.activities, 2)
    }
  }
  return rows
}

function pushActivity(rows: ExportRow[], activity: any, all: Array<any>, depth: number) {
  rows.push({
    id: activity.id,
    title: activity.title,
    type: 'activity',
    status: activity.status,
    ownerParty: activity.ownerParty,
    currentStart: activity.currentStart,
    currentEnd: activity.currentEnd,
    baselineStart: activity.baselineStart,
    baselineEnd: activity.baselineEnd,
    percentComplete: activity.percentComplete,
    depth,
  })
  for (const child of all.filter((a) => a.parentActivityId === activity.id)) pushActivity(rows, child, all, depth + 1)
}

function renderGanttExportHtml(project: any, rows: ExportRow[]): string {
  const dates = rows.flatMap((r) => [r.currentStart, r.currentEnd, r.baselineStart, r.baselineEnd]).filter(Boolean).map((d) => +startOfDay(new Date(d!)))
  dates.push(+startOfDay(new Date(project.plannedStart)), +startOfDay(new Date(project.plannedEnd)))
  const min = new Date(Math.min(...dates))
  const max = new Date(Math.max(...dates))
  const totalDays = Math.max(1, daysBetween(min, max) + 1)
  const generated = new Date().toLocaleString()

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; color: #1f2937; background: #fff; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 12px; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .meta { font-size: 11px; color: #6b7280; line-height: 1.5; text-align: right; }
    .row { display: grid; grid-template-columns: 320px 1fr; min-height: 28px; border-bottom: 1px solid #edf0f2; break-inside: avoid; }
    .task { padding: 6px 8px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .phase .task { font-weight: 700; color: #111827; }
    .timeline { position: relative; min-height: 28px; background: repeating-linear-gradient(to right, #fff 0, #fff 48px, #f8fafc 49px, #f8fafc 50px); }
    .bar { position: absolute; top: 7px; height: 12px; border-radius: 999px; background: #2563eb; }
    .phase .bar { background: #374151; }
    .baseline { position: absolute; top: 21px; height: 4px; border-radius: 999px; background: #a3a3a3; opacity: .75; }
    .progress { height: 100%; border-radius: 999px; background: rgba(0,0,0,.22); }
    .milestone { width: 11px !important; height: 11px; transform: rotate(45deg); border-radius: 2px; }
    .scale { display: grid; grid-template-columns: 320px 1fr; border-bottom: 1px solid #d1d5db; font-size: 10px; color: #6b7280; }
    .scaleTicks { display: flex; justify-content: space-between; padding: 4px 0; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(project.name)}</h1>
      <div class="meta" style="text-align:left">${escapeHtml(project.code)} · ${escapeHtml(project.clientName)} · ${fmt(project.plannedStart)} to ${fmt(project.plannedEnd)}</div>
    </div>
    <div class="meta">Generated ${escapeHtml(generated)}<br />Baseline v${project.baselineVersion || 1}<br />${rows.length} rows</div>
  </header>
  <div class="scale"><div class="task">Task</div><div class="scaleTicks"><span>${fmt(min)}</span><span>${fmt(max)}</span></div></div>
  ${rows.map((row) => renderHtmlRow(row, min, totalDays)).join('')}
</body>
</html>`
}

function renderHtmlRow(row: ExportRow, min: Date, totalDays: number): string {
  const current = rectStyle(row.currentStart, row.currentEnd, min, totalDays)
  const baseline = rectStyle(row.baselineStart, row.baselineEnd, min, totalDays)
  const indent = row.depth * 14
  return `<div class="row ${row.type === 'phase' ? 'phase' : ''}">
    <div class="task" style="padding-left:${8 + indent}px">${escapeHtml(row.title)}</div>
    <div class="timeline">
      ${baseline ? `<div class="baseline ${row.type === 'milestone' ? 'milestone' : ''}" style="${baseline}"></div>` : ''}
      ${current ? `<div class="bar ${row.type === 'milestone' ? 'milestone' : ''}" style="${current}"><div class="progress" style="width:${Math.max(0, Math.min(100, row.percentComplete))}%"></div></div>` : ''}
    </div>
  </div>`
}

function toCsv(rows: ExportRow[]): string {
  const header = ['Type', 'Title', 'Status', 'Owner Party', 'Start', 'End', 'Baseline Start', 'Baseline End', 'Percent']
  return [header, ...rows.map((r) => [r.type, r.title, r.status, r.ownerParty ?? '', fmt(r.currentStart), fmt(r.currentEnd), fmt(r.baselineStart), fmt(r.baselineEnd), String(r.percentComplete)])]
    .map((cells) => cells.map(csvEscape).join(','))
    .join('\n')
}

function toMsProjectXml(name: string, rows: ExportRow[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <Name>${xmlEscape(name)}</Name>
  <Tasks>
${rows.map((row, index) => `    <Task><UID>${index + 1}</UID><ID>${index + 1}</ID><Name>${xmlEscape(row.title)}</Name><OutlineLevel>${row.depth + 1}</OutlineLevel><Start>${xmlDate(row.currentStart)}</Start><Finish>${xmlDate(row.currentEnd)}</Finish><PercentComplete>${Math.round(row.percentComplete)}</PercentComplete></Task>`).join('\n')}
  </Tasks>
</Project>`
}

function rectStyle(start: Date | null, end: Date | null, min: Date, totalDays: number): string | null {
  if (!start && !end) return null
  const s = startOfDay(new Date(start ?? end!))
  const e = startOfDay(new Date(end ?? start!))
  const left = (daysBetween(min, s) / totalDays) * 100
  const width = Math.max(1.2, ((daysBetween(s, e) + 1) / totalDays) * 100)
  return `left:${left}%;width:${width}%`
}

function span(activities: Array<any>, kind: 'current' | 'baseline'): { start: Date | null; end: Date | null } | null {
  const starts = activities.map((a) => a[kind === 'current' ? 'currentStart' : 'baselineStart']).filter(Boolean).map((d) => +new Date(d))
  const ends = activities.map((a) => a[kind === 'current' ? 'currentEnd' : 'baselineEnd']).filter(Boolean).map((d) => +new Date(d))
  if (!starts.length && !ends.length) return null
  return {
    start: new Date(Math.min(...(starts.length ? starts : ends))),
    end: new Date(Math.max(...(ends.length ? ends : starts))),
  }
}

function textDownload(body: string, contentType: string, fileName: string) {
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

function binaryDownload(buffer: Buffer, contentType: string, fileName: string) {
  const body = new Blob([new Uint8Array(buffer)], { type: contentType })
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((+startOfDay(b) - +startOfDay(a)) / 86400000)
}

function fmt(value: Date | string | null): string {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function xmlDate(value: Date | null): string {
  return value ? `${fmt(value)}T08:00:00` : ''
}

function csvEscape(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_')
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

function xmlEscape(value: unknown): string {
  return escapeHtml(value)
}
