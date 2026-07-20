import { NextResponse } from 'next/server'
import { apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { buildPeriodCloseReport } from '@/lib/okr/period-report'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'

export const runtime = 'nodejs'

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

export const GET = withAuth<{ timeframeId: string }>(async (_request, { session, params }) => {
  const report = await buildPeriodCloseReport(params.timeframeId, { id: session.user.id, role: session.user.role })
  if (report === null) return apiForbidden()
  if (report === undefined) return apiNotFound('Timeframe not found')
  try {
    const objectiveRows = report.objectives.map((objective) => `<tr><td>${escapeHtml(objective.title)}</td><td>${escapeHtml(objective.owner.name)}</td><td>${escapeHtml(objective.outcome || objective.closureStatus)}</td><td>${objective.finalGrade?.toFixed(2) ?? '—'}</td><td>${objective.finalProgress == null ? '—' : `${Math.round(objective.finalProgress)}%`}</td><td>${objective.reopenCount}</td></tr>`).join('')
    const lessonRows = report.lessons.map((lesson) => `<section><h3>${escapeHtml(lesson.title)} <small>· ${escapeHtml(lesson.department)}</small></h3><div>${lesson.lesson}</div></section>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:14mm}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:rgb(17,24,39);font-size:12px}h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin-top:24px;border-bottom:1px solid rgb(209,213,219);padding-bottom:6px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.metric{border:1px solid rgb(209,213,219);border-radius:10px;padding:12px}.metric strong{display:block;font-size:22px;margin-top:4px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid rgb(229,231,235)}small,.muted{color:rgb(107,114,128)}</style></head><body><h1>${escapeHtml(report.timeframe.name)} Period Close</h1><p class="muted">${new Date(report.timeframe.startDate).toLocaleDateString()} – ${new Date(report.timeframe.endDate).toLocaleDateString()}</p><div class="metrics"><div class="metric">Objectives closed<strong>${report.closeProgress.closedObjectives}/${report.closeProgress.totalObjectives}</strong></div><div class="metric">Key Results closed<strong>${report.closeProgress.closedKeyResults}/${report.closeProgress.totalKeyResults}</strong></div><div class="metric">Average grade delta<strong>${report.averageGradeDelta?.toFixed(2) ?? '—'}</strong></div><div class="metric">Rolled forward<strong>${report.rollForward.rolled}</strong></div></div><h2>Objective close ledger</h2><table><thead><tr><th>Objective</th><th>Owner</th><th>Outcome</th><th>Grade</th><th>Progress</th><th>Reopens</th></tr></thead><tbody>${objectiveRows}</tbody></table><h2>Lessons digest</h2>${lessonRows || '<p>No closed-OKR lessons yet.</p>'}</body></html>`
    const pdf = await renderHtmlToPdf({ html, landscape: true })
    const filename = `${report.timeframe.name.replace(/[^A-Za-z0-9._-]+/g, '_')}-period-close.pdf`
    return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store' } })
  } catch (error) {
    return apiError('Period-close PDF generation failed', { status: 500, code: 'PDF_FAILED', details: error instanceof Error ? error.message : String(error) })
  }
})
