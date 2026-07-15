/**
 * Cross-project performance report generator for P8/K3.
 *
 * Persists a portfolio snapshot as a ProjectReport(type=PORTFOLIO) so the CEO
 * can compare current dashboard metrics against previous snapshots and export
 * board packs to PDF.
 */

import type { Prisma, ProjectReport } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildPortfolioDashboard, type PortfolioDashboardData } from './portfolio-dashboard'

export const PORTFOLIO_REPORT_TYPE = 'PORTFOLIO'

export interface PortfolioReportContent extends PortfolioDashboardData {
  periodStart: string
  periodEnd: string
}

export async function generatePortfolioReport(opts: { actorId?: string; now?: Date } = {}): Promise<{
  report: ProjectReport
  created: boolean
}> {
  const now = opts.now ?? new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))

  const existing = await prisma.projectReport.findFirst({
    where: { projectId: null, type: PORTFOLIO_REPORT_TYPE, periodStart, periodEnd },
    orderBy: { generatedAt: 'desc' },
  })
  if (existing) return { report: existing, created: false }

  const dashboard = await buildPortfolioDashboard({}, now)
  const content: PortfolioReportContent = {
    ...dashboard,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  }

  const report = await prisma.projectReport.create({
    data: {
      projectId: null,
      type: PORTFOLIO_REPORT_TYPE,
      periodStart,
      periodEnd,
      status: 'DRAFT',
      aiSummary: `${dashboard.summary.projectCount} active projects · SPI ${dashboard.summary.portfolioSpi?.toFixed(2) ?? 'n/a'} · ${dashboard.escalations.length} escalations`,
      contentJson: content as unknown as Prisma.InputJsonValue,
    },
  })

  return { report, created: true }
}

export function renderPortfolioReportPdfHtml(report: ProjectReport): string {
  const content = report.contentJson as unknown as PortfolioReportContent
  const summary = content.summary

  const rows =
    content.projects
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.code)}</td><td>${escapeHtml(p.name)}</td><td>${p.percentComplete.toFixed(0)}%</td><td>${p.spi != null ? p.spi.toFixed(2) : '-'}</td><td>${p.ragStatus}</td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="5" class="muted">No projects.</td></tr>'

  const escalationItems = content.escalations.map((e) => `<li>${escapeHtml(e)}</li>`).join('') || '<li class="muted">No escalations.</li>'

  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: Inter, Arial, sans-serif; color: #172033; margin: 28px; font-size: 12px; }
      h1 { font-size: 25px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 22px 0 8px; }
      .muted { color: #667085; } .headline { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px; background: #f8fafc; font-size: 14px; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
      .kpi { border: 1px solid #d0d5dd; border-radius: 8px; padding: 8px; } .kpi b { display: block; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #e4e7ec; padding: 6px; text-align: left; vertical-align: top; }
      th { color: #475467; font-size: 11px; text-transform: uppercase; background: #f8fafc; }
    </style></head><body>
    <h1>Portfolio Performance Report</h1>
    <div class="muted">${content.periodStart.slice(0, 10)} to ${content.periodEnd.slice(0, 10)} · Generated ${report.generatedAt.toISOString().slice(0, 10)}</div>
    <h2>Headline</h2>
    <div class="headline">${escapeHtml(report.aiSummary ?? '')}</div>
    <div class="kpis">
      <div class="kpi"><span>Projects</span><b>${summary.projectCount}</b></div>
      <div class="kpi"><span>Portfolio SPI</span><b>${summary.portfolioSpi == null ? '-' : summary.portfolioSpi.toFixed(2)}</b></div>
      <div class="kpi"><span>Client-owned delay</span><b>${summary.clientOwnedPct}%</b></div>
      <div class="kpi"><span>Total delay days</span><b>${summary.totalDelayDays}</b></div>
    </div>
    <h2>Projects</h2>
    <table><thead><tr><th>Code</th><th>Name</th><th>Complete</th><th>SPI</th><th>RAG</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>Escalations</h2>
    <ul>${escalationItems}</ul>
  </body></html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}
