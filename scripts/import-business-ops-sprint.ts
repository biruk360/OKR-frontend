#!/usr/bin/env -S npx tsx
/**
 * One-shot importer — sprint "Business & Ops Sep 14 - 25".
 *
 * Source: "Operation & HR Meeting Note.pdf" — Admin & Operations meeting notes for
 * Sep 7, 2026 and Sep 17, 2026 (chair: Biruk Hailu, venue: 360 Ground).
 *
 * Creates the sprint with the standard board lanes, one card per agenda item, and
 * writes each meeting's discussion/decision into the card's comment thread so the
 * history of every item is readable on the card itself.
 *
 * Self-contained (plain PrismaClient, no path aliases) so it can be dropped onto
 * the VPS and run from OKR-frontend/ without a deploy. Idempotent: re-running
 * skips a sprint of the same name.
 *
 * Usage (on the VPS, inside OKR-frontend/):
 *   npx tsx scripts/import-business-ops-sprint.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SPRINT_NAME = 'Business & Ops Sep 14 - 25'
const SPRINT_START = new Date('2026-09-14T00:00:00.000Z')
const SPRINT_END = new Date('2026-09-25T00:00:00.000Z')
const DEPARTMENT_NAME = 'Operations'

const ACTOR_EMAIL = 'biruk@360ground.com'
const BIRUK = 'biruk@360ground.com'
const BETTY = 'betty@360ground.com'
const MEKLIT = 'meklit@360ground.com'
const EDEN = 'eden@360ground.com'

/** Mirrors DEFAULT_LANES in lib/sprints/columns.ts. */
const DEFAULT_LANES = [
  { name: 'To Do', statusKey: 'PENDING', position: 0, color: null as string | null },
  { name: 'In Progress', statusKey: 'IN_PROGRESS', position: 1, color: '#0A84FF' },
  { name: 'In Review', statusKey: 'IN_REVIEW', position: 2, color: '#AF52DE' },
  { name: 'Stuck', statusKey: 'STUCK', position: 3, color: '#FF9500' },
  { name: 'Done', statusKey: 'COMPLETED', position: 4, color: '#34C759' },
]

const SEP_07 = new Date('2026-09-07T10:00:00.000Z')
const SEP_17 = new Date('2026-09-17T10:00:00.000Z')

type Card = {
  title: string
  description: string
  status: 'PENDING' | 'IN_PROGRESS' | 'IN_REVIEW' | 'STUCK' | 'COMPLETED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  members: string[]
  dueDate?: Date
  comments: { at: Date; html: string }[]
}

/** Comment body in the Tiptap HTML the card thread renders. */
function note(meeting: string, parts: { label: string; body: string }[]): string {
  const head = `<p><strong>Meeting update — ${meeting}</strong></p>`
  return head + parts.map((p) => `<p><strong>${p.label}:</strong> ${p.body}</p>`).join('')
}

const M7 = 'Admin &amp; Operations, Sep 7, 2026'
const M17 = 'Admin &amp; Operations, Sep 17, 2026'

const CARDS: Card[] = [
  {
    title: 'Single window — joint session for Bethlehem (recorded)',
    description:
      'Run a joint working session to show Bethlehem Getahun how to use the single window, and record the session so it can be reused as reference material.',
    status: 'PENDING',
    priority: 'MEDIUM',
    members: [BIRUK, BETTY],
    comments: [
      {
        at: SEP_17,
        html: note(M17, [
          { label: 'Discussion', body: 'Prepare a joint session to show Bethlehem Getahun how to use the single window and record the session.' },
          { label: 'Status', body: 'Not started — to be scheduled within this sprint.' },
        ]),
      },
    ],
  },
  {
    title: 'TeleBirr merchant — reassign account ownership to Biruk Hailu',
    description:
      'Prepare and submit the letter requesting reassignment of the TeleBirr merchant account ownership to Biruk Hailu. Follows on from the merchant code change already processed with finance.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    members: [MEKLIT, BIRUK],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Topic', body: 'TelePayment' },
          { label: 'Discussion', body: 'Deposit will be made after the merchant code change request letter is submitted to finance — they will settle.' },
          { label: 'Decision', body: 'They have already changed the merchant code; the deposit is expected to follow.' },
          { label: 'Status', body: 'Done' },
        ]),
      },
      {
        at: SEP_17,
        html: note(M17, [
          { label: 'Decision', body: 'Meklit Gobeze to prepare the letter for submission to reassign account ownership to Biruk Hailu.' },
          { label: 'Status', body: 'In progress — letter to be drafted and submitted.' },
        ]),
      },
    ],
  },
  {
    title: 'Daily follow-up with vendors and forwarders on pending imports',
    description:
      'Follow up at least once a day with each vendor or forwarder holding a pending status, until every pending import item is cleared.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    members: [BETTY],
    comments: [
      {
        at: SEP_17,
        html: note(M17, [
          { label: 'Decision', body: 'Bethlehem Getahun to do follow-up at least once a day with each vendor or forwarder — whoever the status is pending with.' },
          { label: 'Status', body: 'In progress — running daily for the length of this sprint.' },
        ]),
      },
    ],
  },
  {
    title: 'Vivid — import documentation, single packaging list and one shipment',
    description:
      'Vivid to prepare all import documentation and share it with us, collect the items from the different vendors, prepare one consolidated packaging list, and make a single shipment.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    members: [BETTY, MEKLIT],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Topic', body: 'Import POS — import packaging, shipment and packaging' },
          { label: 'Decision', body: 'Vivid should collect items from the different vendors, prepare one packaging list and make one shipment.' },
          { label: 'Status', body: 'Pending' },
        ]),
      },
      {
        at: SEP_17,
        html: note(M17, [
          { label: 'Decision', body: 'Vivid to prepare all documentation and share it with us. Prepare packaging.' },
          { label: 'Status', body: 'In progress' },
        ]),
      },
    ],
  },
  {
    title: 'Find a forwarder from China',
    description: 'Identify and appoint a China-side forwarder for the pending shipments.',
    status: 'PENDING',
    priority: 'HIGH',
    members: [BETTY, BIRUK],
    comments: [
      {
        at: SEP_17,
        html: note(M17, [
          { label: 'Decision', body: 'Bethlehem Getahun and Biruk Hailu to find a forwarder from China.' },
          { label: 'Status', body: 'Not started' },
        ]),
      },
    ],
  },
  {
    title: 'Business license / VAT / TIN — change to new office address',
    description:
      'Change the business license, VAT and TIN registration to the new office address. Submitted to eTrade; supporting documents still to be authenticated.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    members: [BIRUK],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Topic', body: 'Business license, VAT / TIN' },
          { label: 'Discussion', body: 'Address change to the new office address.' },
          { label: 'Decision', body: 'Submitted to eTrade — pending approval / feedback.' },
          { label: 'Status', body: 'Pending' },
        ]),
      },
      {
        at: SEP_17,
        html: note(M17, [
          { label: 'Decision', body: 'Biruk Hailu to authenticate the documents.' },
          { label: 'Status', body: 'In progress' },
        ]),
      },
    ],
  },
  {
    title: 'Liquid payment — submit bank FX request to CBE',
    description: 'Submit the foreign-exchange request to Commercial Bank of Ethiopia for the liquid payment.',
    status: 'PENDING',
    priority: 'HIGH',
    members: [BETTY],
    comments: [
      {
        at: SEP_17,
        html: note(M17, [
          { label: 'Decision', body: 'Bethlehem Getahun to submit the bank FX request to CBE.' },
          { label: 'Status', body: 'Not started' },
        ]),
      },
    ],
  },
  {
    title: 'Import tracking template — populate with the current pending import process',
    description: 'Populate the tracking template with the currently pending import process so every open item is visible in one place.',
    status: 'PENDING',
    priority: 'MEDIUM',
    members: [MEKLIT, BETTY],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Topic', body: 'Template preparation' },
          { label: 'Discussion', body: 'Populate the template with the currently pending import process.' },
          { label: 'Status', body: 'Pending' },
        ]),
      },
    ],
  },
  {
    title: 'Bank permit for loan — follow up with Awash',
    description: 'Bank permit for the loan — awaiting feedback from Yordanos at Awash Bank.',
    status: 'STUCK',
    priority: 'HIGH',
    members: [BIRUK],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Discussion', body: 'Pending feedback from Yordanos @ Awash.' },
          { label: 'Status', body: 'Pending — blocked on an external response.' },
        ]),
      },
    ],
  },
  {
    title: 'Chamber payment — letter from Bemnet',
    description: 'Chamber payment is held up waiting for the letter from Bemnet.',
    status: 'STUCK',
    priority: 'MEDIUM',
    members: [MEKLIT],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Discussion', body: 'Pending letter from Bemnet.' },
          { label: 'Decision', body: 'Meklit Gobeze to follow up.' },
          { label: 'Status', body: 'Pending — blocked on the letter.' },
        ]),
      },
    ],
  },
  {
    title: 'Import POS — Telpo: manufacturing complete, ready to ship',
    description: 'Telpo POS units — manufacturing finished and the order is ready to ship. Arrange shipment under the consolidated Vivid packaging.',
    status: 'IN_REVIEW',
    priority: 'HIGH',
    members: [BETTY, MEKLIT],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Topic', body: 'Import POS — Telpo' },
          { label: 'Discussion', body: 'Manufacturing and latest status.' },
          { label: 'Decision', body: 'Ready to ship.' },
        ]),
      },
    ],
  },
  {
    title: 'Import POS — X-Print',
    description: 'X-Print POS order — status still pending with the vendor.',
    status: 'PENDING',
    priority: 'MEDIUM',
    members: [BETTY],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Topic', body: 'Import POS — X-Print' },
          { label: 'Status', body: 'Pending' },
        ]),
      },
    ],
  },
  {
    title: 'Import POS — HPRT HM-A300E mini thermal printer: place order',
    description:
      'POS — mini thermal receipt printer, HPRT HM-A300E handheld mini thermal label printer, 3 inch / 80mm, pocket portable wireless. Communicate with the vendor and place the order.',
    status: 'PENDING',
    priority: 'MEDIUM',
    members: [MEKLIT],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Discussion', body: 'POS — Mini Thermal Receipt Printer, HPRT HM-A300E handheld mini thermal label printer, 3 inch 80mm, pocket portable wireless.' },
          { label: 'Decision', body: 'Meklit Gobeze needs to communicate with the vendor and place the order.' },
        ]),
      },
    ],
  },
  {
    title: 'Import — Acrylic and related items: source prices, shortlist 3 vendors each',
    description:
      'Source prices and shortlist three vendors for each item: table (790*250*140), TV mount, tablet wall mount, tablet table mount, 21 inch tablet. References: "Acrylic & Other Items Supplier Sourcing & Pricing" and "Acrylic & Related — PI Vivid China Group".',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    members: [MEKLIT, BETTY],
    dueDate: new Date('2026-09-09T00:00:00.000Z'),
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Items', body: 'Table (790*250*140) · TV mount · tablet wall mount · tablet table mount · 21 inch tablet.' },
          { label: 'Decision', body: 'Meklit Gobeze and Bethlehem Getahun to source the price for each item and finalize 3 vendors each by Sep 9, 2026.' },
          { label: 'Status', body: 'Pending' },
        ]),
      },
    ],
  },
  {
    title: 'Import — GPS MSF: Teltonika and JimiIOT order list and shipping plan',
    description:
      'Prepare the order list for Teltonika and JimiIOT (GPS tracker, fuel sensor, driver button, RFID, etc.) from the respective vendors, validate cross-vendor model compatibility, and settle the Kenya-side shipping arrangement and means of shipment.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    members: [MEKLIT, EDEN, BIRUK],
    comments: [
      {
        at: SEP_07,
        html:
          `<p><strong>Meeting update — ${M7}</strong></p>` +
          '<p><strong>Decisions:</strong></p>' +
          '<ul>' +
          '<li>Prepare the order list for Teltonika and JimiIOT — Meklit Gobeze and Eden to draft, Biruk Hailu to approve. GPS tracker, fuel sensor, driver button, RFID etc. from the respective vendors.</li>' +
          '<li>Confirm and validate model compatibility between the Teltonika GPS tracker and the JimiIOT fuel sensor, button and RFID.</li>' +
          '<li>Kenya — figure out the shipping port and how shipping will be handled on the Kenya side, i.e. whether Teltonika can handle it or we need to find someone else.</li>' +
          '<li>Decide on the means of shipment — cargo vs DHL (get a price for both), and also check the Ethiopost option.</li>' +
          '</ul>',
      },
    ],
  },
  {
    title: 'Import — GPS Ethiopost: PI, forwarder and device verification',
    description:
      'Prepare the PI, confirm the China-side forwarder, verify the GPS tracker on motorbikes (quantity of bikers, IP65 vs IP67), and collect the complete vehicle and motor model list with make year.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    members: [MEKLIT, BETTY],
    comments: [
      {
        at: SEP_07,
        html:
          `<p><strong>Meeting update — ${M7}</strong></p>` +
          '<p><strong>Decisions:</strong></p>' +
          '<ul>' +
          '<li>Prepare PI.</li>' +
          '<li>China-side forwarder decided.</li>' +
          '<li>The GPS tracker needs to be verified to work on motorbikes; the quantity of bikers needs to be verified, and whether IP65 or IP67 is the better choice for motorbikes.</li>' +
          '<li>Get the complete vehicle and motor model list, and make year.</li>' +
          '</ul>',
      },
    ],
  },
  {
    title: 'Annual report — finalize and share',
    description: 'Antenayehu to finalize and share the annual report — he already has all the documents.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    members: [BIRUK],
    comments: [
      {
        at: SEP_07,
        html: note(M7, [
          { label: 'Decision', body: 'Antenayehu will finalize and share the annual report — he already has all the documents.' },
        ]),
      },
    ],
  },
]

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const existing = await prisma.sprint.findFirst({ where: { name: SPRINT_NAME }, select: { id: true } })
  if (existing) {
    console.log(`[import] sprint "${SPRINT_NAME}" already exists (${existing.id}) — nothing to do.`)
    return
  }

  const emails = Array.from(new Set([ACTOR_EMAIL, ...CARDS.flatMap((c) => c.members)]))
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, name: true } })
  const byEmail = new Map(users.map((u) => [u.email, u]))
  const missing = emails.filter((e) => !byEmail.has(e))
  if (missing.length > 0) throw new Error(`Missing users: ${missing.join(', ')}`)

  const actor = byEmail.get(ACTOR_EMAIL)!
  const department = await prisma.department.findFirst({ where: { name: DEPARTMENT_NAME }, select: { id: true, name: true } })

  console.log(`[import] ${CARDS.length} cards · owner ${actor.name} · department ${department?.name ?? '—'}`)
  if (dryRun) {
    for (const c of CARDS) console.log(`  · [${c.status}] ${c.title} (${c.comments.length} comment(s))`)
    console.log('[import] dry run — nothing written.')
    return
  }

  const participantIds = Array.from(new Set(CARDS.flatMap((c) => c.members).map((e) => byEmail.get(e)!.id))).filter(
    (id) => id !== actor.id,
  )

  const sprint = await prisma.sprint.create({
    data: {
      name: SPRINT_NAME,
      description:
        'Consolidated action items from the Admin & Operations meetings of Sep 7 and Sep 17, 2026 (chair: Biruk Hailu, venue: 360 Ground). Covers pending imports, POS and GPS procurement, licensing, and banking items.',
      ownerId: actor.id,
      startDate: SPRINT_START,
      endDate: SPRINT_END,
      status: 'ACTIVE',
      state: 'ACTIVE',
      goal: 'Clear the pending import, licensing and banking items carried over from the Sep 7 and Sep 17 Admin & Ops meetings.',
      departmentId: department?.id ?? null,
      columns: { create: DEFAULT_LANES },
      participants: {
        createMany: {
          data: [{ userId: actor.id, role: 'OWNER' }, ...participantIds.map((userId) => ({ userId, role: 'MEMBER' }))],
          skipDuplicates: true,
        },
      },
    },
    include: { columns: true },
  })
  console.log(`[import] sprint created — ${sprint.id}`)

  await prisma.activityLog.create({
    data: { entityType: 'SPRINT', sprintId: sprint.id, action: 'SPRINT_CREATED', actorId: actor.id, metadata: { name: sprint.name, state: sprint.state, source: 'Admin & Ops meeting notes (Sep 7 / Sep 17, 2026)' } },
  })

  const laneByStatus = new Map(sprint.columns.map((c) => [c.statusKey ?? 'PENDING', c]))
  const positionByLane = new Map<string, number>()

  for (const card of CARDS) {
    const lane = laneByStatus.get(card.status)
    if (!lane) throw new Error(`No lane for status ${card.status}`)
    const position = (positionByLane.get(lane.id) ?? 0) + 1000
    positionByLane.set(lane.id, position)

    const memberIds = Array.from(new Set(card.members.map((e) => byEmail.get(e)!.id)))

    const todo = await prisma.todo.create({
      data: {
        title: card.title,
        description: card.description,
        status: card.status,
        priority: card.priority,
        creatorId: actor.id,
        assigneeId: memberIds[0] ?? null,
        sprintId: sprint.id,
        originalSprintId: sprint.id,
        columnId: lane.id,
        sprintPosition: position,
        startDate: SPRINT_START,
        dueDate: card.dueDate ?? SPRINT_END,
        members: { createMany: { data: memberIds.map((userId) => ({ userId })), skipDuplicates: true } },
      },
      select: { id: true, cardNumber: true, title: true },
    })

    for (const c of card.comments) {
      await prisma.todoComment.create({
        data: { todoId: todo.id, authorId: actor.id, content: c.html, createdAt: c.at, updatedAt: c.at },
      })
    }

    await prisma.activityLog.create({
      data: { entityType: 'TODO', todoId: todo.id, sprintId: sprint.id, action: 'INITIATIVE_CREATED', actorId: actor.id, metadata: { title: todo.title, source: 'Admin & Ops meeting notes (Sep 7 / Sep 17, 2026)' } },
    })

    console.log(`  #${todo.cardNumber} [${card.status}] ${todo.title} — ${card.comments.length} comment(s)`)
  }

  console.log(`[import] done — ${CARDS.length} cards in "${SPRINT_NAME}".`)
}

main()
  .catch((e) => {
    console.error('[import] FAILED', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
