#!/usr/bin/env node
/* eslint-disable */
/**
 * One-shot importer for the 360Ground FY2025/26 OKR rollout.
 *
 * Usage (on the VPS, inside the repo):
 *   node scripts/import-360ground-okrs.js /tmp/360Ground_OKR_Import.csv
 *
 * What it does (in order):
 *   1. Verifies required users exist (biruk / eyoel / eden / beza / yared /
 *      yohannes / unassigned), fails fast if any are missing.
 *   2. Renames `Sales` → `Sales & BD` and `Engineering` → `Technology`, then
 *      creates any remaining canonical departments.
 *   3. Creates missing Timeframes (FY2025/26, Q1-Q4 2025/26, H1 2026) with
 *      Ethiopian fiscal-year dates (Jul-Jun). Corrects wrong dates in place.
 *   4. Purges all OKR data (objectives, key results, initiatives, check-ins,
 *      snapshots, activity logs, views, contributors, labels, OKR-linked
 *      comments). Unlinks sprint activities from OKRs without deleting them.
 *   5. Imports the CSV in two passes: objectives first (so KRs can FK into
 *      them), KRs second. Auto-detects each KR's unit (ETB / % / time / qty)
 *      and pulls explicit start/target numbers from phrases like
 *      "from 38% to 55%" or "ETB 75 million" when present; otherwise
 *      defaults to start=0, target=100.
 *
 * Dependency-column handling (per product decision):
 *   Only KR→Objective and Objective→Department edges are modeled. The CSV's
 *   `depends_on` cross-OKR graph is preserved as plain text on the entity's
 *   description so the information isn't lost — but `parentObjectiveId` is
 *   deliberately NOT set from it. Reassign hierarchy via the UI if needed.
 */

const fs = require('fs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// -----------------------------------------------------------------------------
// Tiny CSV parser (handles RFC-4180-ish quoting)
// -----------------------------------------------------------------------------
function parseCsv(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else if (ch === '\r') { /* skip */ }
      else cur += ch
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function rowsToRecords(rows) {
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r[0] && r[0].trim()))
    .map((r) => {
      const o = {}
      headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim() })
      return o
    })
}

// -----------------------------------------------------------------------------
// Metric detection — unit + start/target extraction from the KR title
// -----------------------------------------------------------------------------
function detectMetric(title) {
  const t = title || ''

  // Unit classification. Order matters: ETB > % > time > qty.
  let unit = 'qty'
  if (/\bETB\b/i.test(t)) unit = 'ETB'
  else if (/%|percent|\brate\b/i.test(t)) unit = '%'
  else if (/cycle time|\bdays?\b|\bhours?\b|\bweeks?\b|\bmonths?\b/i.test(t) && !/per\s+(week|month|quarter|day|year)/i.test(t))
    unit = 'time'
  else if (/leads|customers|clients|projects|hires|meetings|contracts|certifications|partnerships|deals|case studies|workshops|MQLs|SQLs|employees|followers|visits|visitors/i.test(t))
    unit = 'qty'

  // "from X to Y" — pull explicit baseline & target.
  const fromTo = t.match(/from\s+([\d.]+)\s*([%a-zA-Z]*)\s+to\s+([\d.]+)/i)
  if (fromTo) {
    const start = parseFloat(fromTo[1])
    const target = parseFloat(fromTo[3])
    if (!Number.isNaN(start) && !Number.isNaN(target) && target !== start) {
      return { unit, start, target }
    }
  }

  // "ETB 75 million" / "ETB 45M" — treat as ETB target.
  const etbMatch = t.match(/ETB\s+([\d.,]+)\s*(million|m\b)?/i)
  if (etbMatch) {
    let n = parseFloat(etbMatch[1].replace(/,/g, ''))
    if (etbMatch[2]) n *= 1_000_000
    if (!Number.isNaN(n) && n > 0) return { unit: 'ETB', start: 0, target: n }
  }

  // "at least N" / "secure N" / "win N" — small counting targets (skip years like 2026).
  const quant = t.match(/(?:\bat\s+least|\bsecure|\bwin|\bhire|\bgenerate|\breach|\bonboard|\bhost|\bestablish|\blaunch|\bpublish|\bachieve)\s+(\d{1,5})\b/i)
  if (quant) {
    const n = parseFloat(quant[1])
    if (!Number.isNaN(n) && n > 0 && n < 2000 && n !== 2025 && n !== 2026) {
      return { unit, start: 0, target: n }
    }
  }

  // Fallback — treat as percent-of-target progress rail.
  return { unit, start: 0, target: 100 }
}

// -----------------------------------------------------------------------------
// Timeline column → existing Timeframe row
// -----------------------------------------------------------------------------
function timelineToTimeframe(timeline, fy, tfMap) {
  const lower = (timeline || '').toLowerCase().trim()
  if (!lower) return fy
  if (tfMap.has(lower)) return tfMap.get(lower)

  // Bare "Q3 2025" etc. already handled above; handle month fallbacks.
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const m = lower.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})$/)
  if (m) {
    const monthIdx = months.indexOf(m[1])
    const year = parseInt(m[2], 10)
    // Ethiopian FY: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec (calendar quarters used in CSV)
    const q = Math.floor(monthIdx / 3) + 1
    return tfMap.get(`q${q} ${year}`) || fy
  }

  // Ranges like "Q4 2025–Q2 2026" → use FY2025/26.
  if (lower.includes('q4 2025') && lower.includes('q2 2026')) return fy
  if (lower === 'fy2025/26') return fy

  return fy
}

// -----------------------------------------------------------------------------
// Owner column → DB user id
// -----------------------------------------------------------------------------
function ownerToUserId(owner, userByEmail) {
  const aliases = {
    biruk: 'biruk@360ground.com',
    eyoel: 'eyoel@360ground.com',
    eden: 'eden@360ground.com',
    beza: 'beza@360ground.com',
    yared: 'yared@360ground.com',
    yohannes: 'yohannes@360ground.com',
    tbd: 'unassigned@360ground.com',
    '': 'unassigned@360ground.com',
  }
  const lower = (owner || '').toLowerCase().trim()
  const email = aliases[lower] || 'unassigned@360ground.com'
  const id = userByEmail.get(email)
  if (!id) throw new Error(`No user found for email ${email} (owner="${owner}")`)
  return id
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: node scripts/import-360ground-okrs.js <path-to-csv>')
    process.exit(1)
  }
  const csvText = fs.readFileSync(csvPath, 'utf-8')
  const records = rowsToRecords(parseCsv(csvText))
  console.log(`[csv] parsed ${records.length} rows`)

  // --- 1. Verify required users ---
  const dbUsers = await prisma.user.findMany({ where: { isActive: true } })
  const userByEmail = new Map(dbUsers.map((u) => [u.email.toLowerCase(), u.id]))
  const requiredEmails = [
    'biruk@360ground.com',
    'eyoel@360ground.com',
    'eden@360ground.com',
    'beza@360ground.com',
    'yared@360ground.com',
    'yohannes@360ground.com',
    'unassigned@360ground.com',
  ]
  for (const email of requiredEmails) {
    if (!userByEmail.has(email)) {
      console.error(`[fatal] missing user: ${email}`)
      process.exit(2)
    }
  }
  console.log(`[users] all ${requiredEmails.length} required owners present`)

  // --- 2. Departments ---
  const renameMap = [
    ['Sales', 'Sales & BD'],
    ['Engineering', 'Technology'],
  ]
  for (const [oldName, newName] of renameMap) {
    const existing = await prisma.department.findUnique({ where: { name: oldName } })
    if (!existing) continue
    const collision = await prisma.department.findUnique({ where: { name: newName } })
    if (!collision) {
      await prisma.department.update({ where: { id: existing.id }, data: { name: newName } })
      console.log(`[dept] renamed ${oldName} → ${newName}`)
    }
  }
  const canonicalDepts = ['Sales & BD', 'Technology', 'Import & Retail', 'Operations', 'Finance', 'Marketing', 'HR']
  for (const name of canonicalDepts) {
    const existing = await prisma.department.findUnique({ where: { name } })
    if (!existing) {
      await prisma.department.create({ data: { name, isActive: true } })
      console.log(`[dept] created ${name}`)
    }
  }
  const depts = await prisma.department.findMany()
  const deptByName = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]))

  // --- 3. Timeframes ---
  const wantedTfs = [
    { name: 'FY2025/26', type: 'YEARLY', startDate: '2025-07-01', endDate: '2026-06-30' },
    { name: 'Q1 2025', type: 'QUARTERLY', startDate: '2025-01-01', endDate: '2025-03-31' },
    { name: 'Q2 2025', type: 'QUARTERLY', startDate: '2025-04-01', endDate: '2025-06-30' },
    { name: 'Q3 2025', type: 'QUARTERLY', startDate: '2025-07-01', endDate: '2025-09-30' },
    { name: 'Q4 2025', type: 'QUARTERLY', startDate: '2025-10-01', endDate: '2025-12-31' },
    { name: 'Q1 2026', type: 'QUARTERLY', startDate: '2026-01-01', endDate: '2026-03-31' },
    { name: 'Q2 2026', type: 'QUARTERLY', startDate: '2026-04-01', endDate: '2026-06-30' },
    { name: 'Q3 2026', type: 'QUARTERLY', startDate: '2026-07-01', endDate: '2026-09-30' },
    { name: 'Q4 2026', type: 'QUARTERLY', startDate: '2026-10-01', endDate: '2026-12-31' },
    { name: 'H1 2026', type: 'SIX_MONTH', startDate: '2026-01-01', endDate: '2026-06-30' },
  ]
  for (const tf of wantedTfs) {
    const sd = new Date(tf.startDate)
    const ed = new Date(tf.endDate)
    const existing = await prisma.timeframe.findUnique({ where: { name: tf.name } })
    if (!existing) {
      await prisma.timeframe.create({
        data: { name: tf.name, type: tf.type, startDate: sd, endDate: ed, isActive: true },
      })
      console.log(`[timeframe] created ${tf.name}`)
    } else if (
      existing.startDate.getTime() !== sd.getTime() ||
      existing.endDate.getTime() !== ed.getTime() ||
      existing.type !== tf.type
    ) {
      await prisma.timeframe.update({
        where: { id: existing.id },
        data: { type: tf.type, startDate: sd, endDate: ed },
      })
      console.log(`[timeframe] fixed dates: ${tf.name}`)
    }
  }
  const tfs = await prisma.timeframe.findMany()
  const tfMap = new Map(tfs.map((t) => [t.name.toLowerCase(), t]))
  const fy = tfMap.get('fy2025/26')
  if (!fy) throw new Error('FY2025/26 timeframe missing after setup')

  // --- 4. Purge ---
  console.log('[purge] deleting OKR data…')
  await prisma.$transaction(async (tx) => {
    // Null out Objective self-references first so deleteMany succeeds.
    await tx.objective.updateMany({ data: { parentObjectiveId: null } })

    await tx.confidenceSnapshot.deleteMany({})
    await tx.keyResultCheckIn.deleteMany({})
    await tx.keyResultView.deleteMany({})
    await tx.objectiveView.deleteMany({})
    await tx.objectiveContributor.deleteMany({})
    await tx.objectiveLabel.deleteMany({})
    await tx.initiativeUpdate.deleteMany({})
    await tx.todo.deleteMany({})
    await tx.comment.deleteMany({
      where: { OR: [{ objectiveId: { not: null } }, { keyResultId: { not: null } }] },
    })
    await tx.activityLog.deleteMany({
      where: { entityType: { in: ['OBJECTIVE', 'KEY_RESULT'] } },
    })
    // Keep sprint cards but unlink them.
    await tx.sprintActivity.updateMany({
      where: { OR: [{ keyResultId: { not: null } }, { objectiveId: { not: null } }] },
      data: { keyResultId: null, objectiveId: null },
    })
    await tx.keyResult.deleteMany({})
    await tx.objective.deleteMany({})
  })
  console.log('[purge] complete')

  // --- 5. Import — Pass 1: Objectives ---
  const objectiveRecords = records.filter((r) => r.type === 'Objective')
  const krRecords = records.filter((r) => r.type === 'Key Result')
  console.log(`[import] ${objectiveRecords.length} objectives + ${krRecords.length} key results`)

  const csvIdToObjId = new Map()
  for (const row of objectiveRecords) {
    const tf = timelineToTimeframe(row.timeline, fy, tfMap)
    const ownerId = ownerToUserId(row.owner, userByEmail)

    let level = 'INDIVIDUAL'
    if (row.level === 'Company') level = 'COMPANY'
    else if (row.level === 'Department') level = 'DEPARTMENT'
    else if (row.level === 'Team') level = 'INDIVIDUAL'

    let departmentId = null
    const dept = row.department
    if (dept && dept !== 'Company' && dept !== 'Team') {
      departmentId = deptByName.get(dept.toLowerCase()) || null
      if (!departmentId) {
        console.warn(`[warn] unknown department "${dept}" on ${row.id} — leaving null`)
      }
    }

    const depNote = row.depends_on ? `\n\nAligned to: ${row.depends_on.replace(/\|/g, ', ')}` : ''
    const description = `[${row.id}]${depNote}`

    const obj = await prisma.objective.create({
      data: {
        title: row.title,
        description,
        level,
        status: 'ACTIVE',
        goalStatus: 'ON_TRACK',
        progress: 0,
        ownerId,
        timeframeId: tf.id,
        departmentId,
        startDate: tf.startDate,
        endDate: tf.endDate,
        isPrivate: false,
        alignmentType: 'LOOSE',
        rollupCalculation: 'NONE',
        checkInCadence: 'WEEKLY',
      },
    })
    csvIdToObjId.set(row.id, obj.id)
  }
  console.log(`[import] created ${csvIdToObjId.size} objectives`)

  // --- 6. Import — Pass 2: Key Results ---
  let krCreated = 0
  let krSkipped = 0
  for (const row of krRecords) {
    const parentObjectiveId = csvIdToObjId.get(row.parent_id)
    if (!parentObjectiveId) {
      console.error(`[skip] KR ${row.id}: parent ${row.parent_id} not found`)
      krSkipped++
      continue
    }
    const ownerId = ownerToUserId(row.owner, userByEmail)
    const metric = detectMetric(row.title)
    const depNote = row.depends_on ? `\n\nDepends on: ${row.depends_on.replace(/\|/g, ', ')}` : ''
    const targetDate = row.timeline && row.timeline !== 'FY2025/26' ? `Target: ${row.timeline}` : ''
    const description = [`[${row.id}]`, targetDate, depNote].filter(Boolean).join(targetDate ? '\n\n' : '')

    await prisma.keyResult.create({
      data: {
        title: row.title,
        description,
        startValue: metric.start,
        targetValue: metric.target,
        currentValue: metric.start,
        unit: metric.unit,
        progress: 0,
        confidence: 'ON_TRACK',
        status: 'ACTIVE',
        ownerId,
        objectiveId: parentObjectiveId,
        isPrivate: false,
        checkInCadence: 'WEEKLY',
      },
    })
    krCreated++
  }
  console.log(`[import] created ${krCreated} key results (skipped ${krSkipped})`)

  // --- 7. Done ---
  const finalObj = await prisma.objective.count()
  const finalKr = await prisma.keyResult.count()
  console.log(`[done] Objectives: ${finalObj} · Key Results: ${finalKr}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
