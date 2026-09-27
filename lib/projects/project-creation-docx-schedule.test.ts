import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
} from 'docx'
import { extractProjectCreationDocx } from './docx-extract'
import {
  buildProjectCreationDocxSchedule,
  parseProjectCreationDocxDate,
} from './creation-docx-schedule'
import { combineNormalizedProjectCreationDraft, createEmptyProjectCreationProjectJson } from './creation-normalize'
import { projectCreationClientCommitBlockers } from './creation-commit-shared'

function table(rows: string[][]): Table {
  return new Table({
    rows: rows.map((cells) => new TableRow({
      children: cells.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
    })),
  })
}

async function docx(children: Array<Paragraph | Table>): Promise<Uint8Array> {
  return Packer.toBuffer(new Document({ sections: [{ children }] }))
}

async function build(children: Array<Paragraph | Table>) {
  const extraction = await extractProjectCreationDocx(await docx(children))
  return buildProjectCreationDocxSchedule(extraction, { activeAssigneeEmails: new Set() })
}

describe('DOCX → schedule deterministic extraction', () => {
  it('turns phase headings and task tables into phases, activities, milestones, and deliverables with DOCX provenance', async () => {
    const result = await build([
      new Paragraph({ text: 'Work Plan', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: 'Phase 1: Inception', heading: HeadingLevel.HEADING_2 }),
      table([
        ['No', 'Task', 'Start Date', 'End Date', 'Responsible', 'Deliverable'],
        ['1.1', 'Kick-off meeting', '2026-09-01', '2026-09-02', 'Client', ''],
        ['1.2', 'Inception report drafting', '03/09/2026', '15/09/2026', '360Ground', 'Inception report'],
        ['1.3', 'Milestone: Inception approved', '', '2026-09-18', 'Client', ''],
      ]),
      new Paragraph({ text: 'Phase 2: Build', heading: HeadingLevel.HEADING_2 }),
      table([
        ['Activity', 'Start', 'Duration', 'Owner'],
        ['Configure platform', '2026-09-21', '5 days', 'Team Lead'],
        ['Deliverable: Configured platform', '', '', '360Ground'],
      ]),
    ])

    const { scheduleJson, validationJson, summary } = result
    assert.deepEqual(scheduleJson.phases.map((phase) => phase.name), ['Phase 1: Inception', 'Phase 2: Build'])
    assert.deepEqual(scheduleJson.activities.map((activity) => activity.title), [
      'Kick-off meeting', 'Inception report drafting', 'Configure platform',
    ])
    const inception = scheduleJson.milestones.find((milestone) => milestone.name === 'Inception approved')
    assert.ok(inception, 'the milestone row becomes a milestone')
    assert.equal(inception!.dueDate, '2026-09-18')
    assert.equal(inception!.isKeyMilestone, true)
    assert.ok(scheduleJson.activities.slice(0, 2).every((activity) => activity.milestoneId === inception!.id),
      'activities before a milestone row belong to it')

    const [kickoff, drafting, configure] = scheduleJson.activities
    assert.equal(kickoff.ownerParty, 'CLIENT')
    assert.equal(drafting.startDate, '2026-09-03')
    assert.equal(drafting.endDate, '2026-09-15')
    assert.equal(configure.startDate, '2026-09-21')
    assert.equal(configure.endDate, '2026-09-25', '5 working days from Monday end on Friday')
    assert.equal(configure.ownerParty, '360GROUND')
    assert.equal(configure.suggestedRole, 'Team Lead')

    assert.ok(scheduleJson.deliverables.some((deliverable) => deliverable.name === 'Inception report'))
    const platform = scheduleJson.deliverables.find((deliverable) => deliverable.name === 'Configured platform')
    assert.ok(platform, 'a Deliverable row becomes a deliverable')
    assert.deepEqual(platform!.producingActivityIds, [configure.id])

    // Every extracted row is traceable to its table row with a confidence level.
    for (const activity of scheduleJson.activities) {
      const source = scheduleJson.sources.find((candidate) => candidate.targetPaths.includes(`activities.${activity.id}`))
      assert.ok(source, `activity ${activity.title} has a source record`)
      assert.equal(source!.type, 'DOCX_TABLE')
      assert.match(source!.reference, /^Table \d+ under Work Plan > Phase \d: \w+, row \d+$/)
      assert.equal(source!.basis, 'SOURCE_FACT')
    }
    const draftingSource = scheduleJson.sources.find((source) => source.targetPaths.includes(`activities.${drafting.id}`))!
    assert.equal(draftingSource.confidence, 'LOW', 'ambiguous d/m dates are low confidence')
    assert.ok(validationJson.warnings.some((warning) => warning.code === 'DOCX_LOW_CONFIDENCE'
      && warning.affectedPaths.includes(`activities.${drafting.id}`)))

    // Derived dates and generated groupings are explicit, proposed assumptions.
    assert.ok(validationJson.assumptions.some((assumption) => assumption.category === 'DATE'
      && assumption.affectedPaths.includes(`activities.${configure.id}`) && assumption.status === 'PROPOSED'))
    assert.ok(validationJson.assumptions.some((assumption) => /generated milestone "Phase 2: Build activities"/.test(assumption.text)))

    // Marked for review: an unacknowledged review warning keeps Create Project disabled.
    const review = validationJson.warnings.find((warning) => warning.code === 'DOCX_SCHEDULE_REVIEW')
    assert.ok(review && !review.acknowledged)
    assert.equal(summary.activities, 3)
    const project = createEmptyProjectCreationProjectJson('pm-1')
    const blockers = projectCreationClientCommitBlockers(
      combineNormalizedProjectCreationDraft(project, scheduleJson, validationJson),
      'FILE_IMPORT',
    )
    assert.ok(blockers.includes('Acknowledge every non-blocking warning before creation.'))
    assert.ok(blockers.includes('Accept or reject every proposed assumption before creation.'))
    assert.equal(result.hasBlockingErrors, false)
  })

  it('groups activities under a separate milestones table by date and attaches floating deliverables', async () => {
    const result = await build([
      new Paragraph({ text: 'Implementation Schedule', heading: HeadingLevel.HEADING_1 }),
      table([
        ['Phase', 'Activity', 'Start Date', 'End Date'],
        ['Discovery', 'Stakeholder interviews', '1 September 2026', '10 September 2026'],
        ['Discovery', 'Current-state analysis', 'Sep 11, 2026', 'Sep 18, 2026'],
        ['Delivery', 'Build pilot', '2026-09-21', '2026-10-16'],
      ]),
      new Paragraph({ text: 'Milestones', heading: HeadingLevel.HEADING_1 }),
      table([
        ['Milestone', 'Due Date'],
        ['Discovery sign-off', '2026-09-18'],
        ['Pilot live', '2026-10-16'],
      ]),
      new Paragraph({ text: 'Deliverables', heading: HeadingLevel.HEADING_1 }),
      table([
        ['Deliverable', 'Due Date', 'Owner'],
        ['Discovery report', '2026-09-18', 'Consultant'],
        ['Pilot handover pack', '', 'Client'],
      ]),
    ])
    const { scheduleJson, validationJson } = result
    assert.deepEqual(scheduleJson.phases.map((phase) => phase.name), ['Discovery', 'Delivery'])
    const signOff = scheduleJson.milestones.find((milestone) => milestone.name === 'Discovery sign-off')!
    const pilot = scheduleJson.milestones.find((milestone) => milestone.name === 'Pilot live')!
    assert.equal(signOff.dueDate, '2026-09-18')
    assert.equal(scheduleJson.phases.find((phase) => phase.id === signOff.phaseId)!.name, 'Discovery')
    assert.equal(scheduleJson.phases.find((phase) => phase.id === pilot.phaseId)!.name, 'Delivery')
    assert.deepEqual(
      scheduleJson.activities.filter((activity) => activity.milestoneId === signOff.id).map((activity) => activity.title),
      ['Stakeholder interviews', 'Current-state analysis'],
    )
    assert.equal(scheduleJson.activities.find((activity) => activity.title === 'Build pilot')!.milestoneId, pilot.id)

    const report = scheduleJson.deliverables.find((deliverable) => deliverable.name === 'Discovery report')!
    assert.equal(report.milestoneId, signOff.id)
    assert.equal(report.ownerParty, '360GROUND')
    const handover = scheduleJson.deliverables.find((deliverable) => deliverable.name === 'Pilot handover pack')!
    assert.equal(handover.dueDate, null)
    assert.equal(handover.ownerParty, 'CLIENT')
    assert.ok(validationJson.warnings.some((warning) => warning.code === 'DOCX_DELIVERABLE_WITHOUT_DATE'
      && warning.affectedPaths.includes(`deliverables.${handover.id}.dueDate`)))
    assert.ok(validationJson.assumptions.some((assumption) => assumption.category === 'DELIVERABLE'
      && assumption.affectedPaths.includes(`deliverables.${report.id}`)))
  })

  it('reads bulleted activities under phase headings and never invents a schedule from narrative text', async () => {
    const result = await build([
      new Paragraph({ text: 'Background', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('The client needs a new records system; work starts 1 September 2026.'),
      new Paragraph({ text: 'Stage 1 — Assessment', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: 'Review existing records (1 Sep 2026 to 5 Sep 2026)', bullet: { level: 0 } }),
      new Paragraph({ text: 'Milestone: Assessment accepted by 12 September 2026', bullet: { level: 0 } }),
    ])
    const { scheduleJson } = result
    assert.deepEqual(scheduleJson.phases.map((phase) => phase.name), ['Stage 1 — Assessment'])
    assert.equal(scheduleJson.activities.length, 1)
    assert.equal(scheduleJson.activities[0].title, 'Review existing records')
    assert.equal(scheduleJson.activities[0].startDate, '2026-09-01')
    assert.equal(scheduleJson.activities[0].endDate, '2026-09-05')
    const milestone = scheduleJson.milestones.find((candidate) => candidate.id === scheduleJson.activities[0].milestoneId)!
    assert.equal(milestone.name, 'Assessment accepted')
    assert.equal(milestone.dueDate, '2026-09-12')
    const source = scheduleJson.sources.find((candidate) => candidate.targetPaths.includes(`activities.${scheduleJson.activities[0].id}`))!
    assert.equal(source.type, 'DOCX_PARAGRAPH')
    assert.equal(source.confidence, 'MEDIUM')
  })

  it('keeps a document without schedule tables as source evidence only', async () => {
    const result = await build([
      new Paragraph({ text: 'Project Overview', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('Implementation of the customer portal.'),
      new Paragraph({ text: 'Deliverables', heading: HeadingLevel.HEADING_2 }),
      table([['Deliverable', 'Owner'], ['Approved design', 'Client']]),
    ])
    assert.deepEqual(result.scheduleJson.phases, [])
    assert.deepEqual(result.scheduleJson.activities, [])
    assert.equal(result.scheduleJson.sources.length, 4)
    assert.ok(result.validationJson.warnings.some((warning) => warning.code === 'DOCX_DELIVERABLES_WITHOUT_SCHEDULE'))
  })

  it('parses document date formats and flags ambiguity', () => {
    assert.deepEqual(parseProjectCreationDocxDate('2026-09-01'), { iso: '2026-09-01', ambiguous: false })
    assert.deepEqual(parseProjectCreationDocxDate('25/09/2026'), { iso: '2026-09-25', ambiguous: false })
    assert.deepEqual(parseProjectCreationDocxDate('09/25/2026'), { iso: '2026-09-25', ambiguous: false })
    assert.deepEqual(parseProjectCreationDocxDate('03/09/2026'), { iso: '2026-09-03', ambiguous: true })
    assert.deepEqual(parseProjectCreationDocxDate('1st September 2026'), { iso: '2026-09-01', ambiguous: false })
    assert.deepEqual(parseProjectCreationDocxDate('Sept 30, 2026'), { iso: '2026-09-30', ambiguous: false })
    assert.equal(parseProjectCreationDocxDate('31/02/2026'), null)
    assert.equal(parseProjectCreationDocxDate('Week 3'), null)
  })
})
