import { NextRequest, NextResponse } from 'next/server'
import { apiBadRequest, apiForbidden, withAuth } from '@/lib/api'
import { canCreateProject } from '@/lib/permissions'
import {
  createScheduleImportTemplate,
  type ScheduleImportTemplateDownload,
  type ScheduleImportTemplateFormat,
} from '@/lib/projects/schedule-import-template'
import { createProjectDocxTemplate } from '@/lib/projects/project-docx-template'

type CreationTemplateFormat = ScheduleImportTemplateFormat | 'docx'
const FORMATS = new Set<CreationTemplateFormat>(['csv', 'xlsx', 'docx'])

export const GET = withAuth(async (request: NextRequest, { session }) => {
  if (!canCreateProject({
    role: session.user.role,
    isProjectManager: session.user.isProjectManager,
  })) {
    return apiForbidden('Insufficient permissions')
  }

  const format = new URL(request.url).searchParams.get('format')
  if (!format || !FORMATS.has(format as CreationTemplateFormat)) {
    return apiBadRequest('Format must be csv, xlsx or docx')
  }

  // Spreadsheets share the schedule generator; the DOCX is the Story 2.5 TOR/work-plan template.
  const template: ScheduleImportTemplateDownload = format === 'docx'
    ? await createProjectDocxTemplate()
    : createScheduleImportTemplate(format as ScheduleImportTemplateFormat)
  return new NextResponse(new Blob([Uint8Array.from(template.bytes)]), {
    headers: {
      'content-type': template.contentType,
      'content-disposition': `attachment; filename="${template.filename}"`,
      'cache-control': 'private, no-store',
    },
  })
})
