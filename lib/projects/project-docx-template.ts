import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { ScheduleImportTemplateDownload } from './schedule-import-template'

/**
 * Story 2.5 — the project TOR / work-plan Word template (requirements §8.2):
 * "structured headings for project overview, dates, scope, deliverables,
 * milestones, activities, dependencies, assumptions, responsibilities,
 * approvals, and exclusions."
 *
 * Built with the installed `docx` package (no new dependency). The section
 * headings deliberately use the vocabulary `docx-extract.ts` classifies
 * (CATEGORY_RULES), so a completed template imported through Story 2.4 lands
 * every block in the right candidate category. Tables keep one header row so
 * the extractor's row/cell provenance stays exact. The file is static and
 * identical for everyone, so it is rendered once per process.
 */

export const PROJECT_DOCX_TEMPLATE_FILENAME = 'project-work-plan-template.docx'
export const PROJECT_DOCX_TEMPLATE_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface ProjectDocxTemplateSection {
  heading: string
  guidance: string
  table?: { headers: string[]; example: string[] }
}

export const PROJECT_DOCX_TEMPLATE_SECTIONS: readonly ProjectDocxTemplateSection[] = [
  {
    heading: 'Project Overview',
    guidance: 'Project name, client, contract reference and the business outcome this project delivers.',
    table: { headers: ['Field', 'Value'], example: ['Project name', 'Customer portal implementation'] },
  },
  {
    heading: 'Timeline and Key Dates',
    guidance: 'Planned start date, end date and any fixed deadlines. Use YYYY-MM-DD.',
    table: { headers: ['Date', 'Description'], example: ['2026-09-01', 'Project start'] },
  },
  {
    heading: 'Scope',
    guidance: 'What is in scope: work packages, modules, locations and user groups covered.',
  },
  {
    heading: 'Deliverables',
    guidance: 'Every output the client receives and accepts.',
    table: { headers: ['Deliverable', 'Description', 'Due date'], example: ['Approved solution design', 'Signed-off design document', '2026-09-30'] },
  },
  {
    heading: 'Milestones',
    guidance: 'Checkpoints that mark the end of a phase or a payment gate.',
    table: { headers: ['Milestone', 'Phase', 'Target date'], example: ['Design sign-off', 'Discovery', '2026-09-30'] },
  },
  {
    heading: 'Activities (Work Plan)',
    guidance: 'The schedule: one row per task with its phase, planned start and end dates and owner party (360GROUND, CLIENT or SHARED).',
    table: {
      headers: ['Activity', 'Phase', 'Start date', 'End date', 'Owner party'],
      example: ['Requirements workshop', 'Discovery', '2026-09-01', '2026-09-05', 'SHARED'],
    },
  },
  {
    heading: 'Dependencies',
    guidance: 'Which activity must finish (or start) before another, with any lag in days.',
    table: { headers: ['Predecessor', 'Successor', 'Type', 'Lag (days)'], example: ['Requirements workshop', 'Solution design', 'FS', '0'] },
  },
  {
    heading: 'Assumptions and Constraints',
    guidance: 'Conditions the plan relies on, known constraints and risks.',
  },
  {
    heading: 'Roles and Responsibilities',
    guidance: 'Who is responsible for what on each side. Name the party or role, not individuals, if this document will be shared.',
    table: { headers: ['Responsibility', 'Owner party'], example: ['Provide test data', 'CLIENT'] },
  },
  {
    heading: 'Approvals and Acceptance',
    guidance: 'Review steps, approval turnaround (SLA in business days) and sign-off criteria.',
    table: { headers: ['Approval step', 'Approver party', 'SLA (business days)'], example: ['Design sign-off', 'CLIENT', '5'] },
  },
  {
    heading: 'Exclusions (Out of Scope)',
    guidance: 'Anything explicitly not included in this project.',
  },
]

function cell(text: string, bold = false): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] })
}

function sectionChildren(section: ProjectDocxTemplateSection): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: section.guidance, italics: true, color: '6B7280' })] }),
  ]
  if (section.table) {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: section.table.headers.map((header) => cell(header, true)) }),
        new TableRow({ children: section.table.example.map((value) => cell(value)) }),
      ],
    }))
  } else {
    children.push(new Paragraph('Replace this line with your content.'))
  }
  return children
}

let cached: Buffer | null = null

export async function createProjectDocxTemplate(): Promise<ScheduleImportTemplateDownload> {
  if (!cached) {
    const doc = new Document({
      creator: '360Ground',
      title: 'Project work plan template',
      description: 'Project TOR / work-plan template for project import',
      sections: [{
        children: [
          new Paragraph({ text: 'Project Work Plan', heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({
              text: 'Keep the section headings unchanged, replace the example rows, and delete guidance you do not need. Upload the completed file from New Project → Import; nothing is created until you review and confirm.',
              italics: true,
            })],
          }),
          ...PROJECT_DOCX_TEMPLATE_SECTIONS.flatMap(sectionChildren),
        ],
      }],
    })
    cached = await Packer.toBuffer(doc)
  }
  return { bytes: cached, contentType: PROJECT_DOCX_TEMPLATE_CONTENT_TYPE, filename: PROJECT_DOCX_TEMPLATE_FILENAME }
}
