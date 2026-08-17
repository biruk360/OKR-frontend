import { NextRequest, NextResponse } from 'next/server'
import { getReadableProject } from '@/lib/projects/access'
import { createScheduleImportTemplate } from '@/lib/projects/schedule-import-template'
import { apiForbidden, withAuth } from '@/lib/api'

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const template = createScheduleImportTemplate(format)
  return new NextResponse(new Blob([Uint8Array.from(template.bytes)]), {
    headers: {
      'content-type': template.contentType,
      'content-disposition': `attachment; filename="${template.filename}"`,
    },
  })
})
