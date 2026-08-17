import { NextRequest, NextResponse } from 'next/server'
import { apiBadRequest, apiForbidden, withAuth } from '@/lib/api'
import { canCreateProject } from '@/lib/permissions'
import {
  createScheduleImportTemplate,
  type ScheduleImportTemplateFormat,
} from '@/lib/projects/schedule-import-template'

const FORMATS = new Set<ScheduleImportTemplateFormat>(['csv', 'xlsx'])

export const GET = withAuth(async (request: NextRequest, { session }) => {
  if (!canCreateProject({
    role: session.user.role,
    isProjectManager: session.user.isProjectManager,
  })) {
    return apiForbidden('Insufficient permissions')
  }

  const format = new URL(request.url).searchParams.get('format')
  if (!format || !FORMATS.has(format as ScheduleImportTemplateFormat)) {
    return apiBadRequest('Format must be csv or xlsx')
  }

  const template = createScheduleImportTemplate(format as ScheduleImportTemplateFormat)
  return new NextResponse(new Blob([Uint8Array.from(template.bytes)]), {
    headers: {
      'content-type': template.contentType,
      'content-disposition': `attachment; filename="${template.filename}"`,
      'cache-control': 'private, no-store',
    },
  })
})
