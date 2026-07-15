import type { DelayLedgerResult } from './delay-ledger'

export interface DelayLedgerPdfProject {
  code: string
  name: string
  clientName: string
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}

function ownerLabel(owner: string): string {
  return owner === '360GROUND' ? '360Ground' : owner.charAt(0) + owner.slice(1).toLowerCase()
}

export function renderDelayLedgerPdfHtml(project: DelayLedgerPdfProject, ledger: DelayLedgerResult): string {
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const rows = ledger.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.activityTitle ?? '(deleted activity)')}</td>
      <td>${escapeHtml(row.phase ?? '')}</td>
      <td>${escapeHtml(formatDate(row.baselineDate))}</td>
      <td>${escapeHtml(formatDate(row.currentDate))}</td>
      <td class="num">${escapeHtml(row.daysLost)}d</td>
      <td>${escapeHtml(row.reason.replace(/_/g, ' '))}</td>
      <td>${escapeHtml(ownerLabel(row.owner))}</td>
      <td>${row.slaBreachDays == null ? '' : `+${escapeHtml(row.slaBreachDays)}d`}</td>
      <td>${escapeHtml(row.recoveryPlan ?? '')}</td>
      <td>${escapeHtml(row.recoveryOwner ?? '')}</td>
      <td>${escapeHtml(formatDate(row.recoveryDate))}</td>
    </tr>
  `).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Delay Ledger - ${escapeHtml(project.code)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 10px;
      line-height: 1.35;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid #D1D5DB;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 20px;
      line-height: 1.15;
    }
    .meta { color: #4B5563; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .metric {
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 8px;
      background: #F9FAFB;
    }
    .metric strong {
      display: block;
      margin-top: 3px;
      color: #111827;
      font-size: 15px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border-bottom: 1px solid #E5E7EB;
      padding: 6px 5px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th {
      color: #374151;
      background: #F3F4F6;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .empty {
      border: 1px dashed #D1D5DB;
      border-radius: 6px;
      padding: 24px;
      color: #6B7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Delay Ledger</h1>
      <div class="meta">${escapeHtml(project.code)} &middot; ${escapeHtml(project.name)}</div>
      <div class="meta">Client: ${escapeHtml(project.clientName)}</div>
    </div>
    <div class="meta">Generated ${escapeHtml(generatedAt)}</div>
  </header>
  <section class="summary">
    <div class="metric">Total delay<strong>${escapeHtml(ledger.totals.total)}d</strong></div>
    <div class="metric">Client-owned<strong>${escapeHtml(ledger.totals.byOwner.CLIENT ?? 0)}d</strong></div>
    <div class="metric">360Ground-owned<strong>${escapeHtml(ledger.totals.byOwner['360GROUND'] ?? 0)}d</strong></div>
    <div class="metric">Shared<strong>${escapeHtml(ledger.totals.byOwner.SHARED ?? 0)}d</strong></div>
  </section>
  ${ledger.rows.length === 0 ? '<div class="empty">No delay events match the current filters.</div>' : `
    <table>
      <thead>
        <tr>
          <th style="width: 15%">Activity</th>
          <th style="width: 10%">Phase</th>
          <th style="width: 8%">Baseline</th>
          <th style="width: 8%">Current</th>
          <th style="width: 6%">Slip</th>
          <th style="width: 13%">Reason</th>
          <th style="width: 8%">Owner</th>
          <th style="width: 7%">SLA</th>
          <th style="width: 13%">Recovery plan</th>
          <th style="width: 7%">Recovery owner</th>
          <th style="width: 7%">Recovery date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `}
</body>
</html>`
}
