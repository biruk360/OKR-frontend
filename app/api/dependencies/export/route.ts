import { NextResponse, type NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import {
  firstDependencyIssue,
  listDependenciesQuerySchema,
  readListQuery,
} from '@/features/dependencies/services/schemas'
import { listDependencies } from '@/features/dependencies/services/dependencies.server'
import { buildDependencyCsv } from '@/features/dependencies/services/rules'
import { dependencyErrorResponse } from '@/features/dependencies/services/http.server'

/**
 * GET /api/dependencies/export?… — DEP-6 CSV of the same filtered list as
 * GET /api/dependencies. Rows the viewer may not open export title + status only.
 */
export const GET = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = listDependenciesQuerySchema.safeParse(readListQuery(new URL(request.url).searchParams))
  if (!parsed.success) return apiValidationError(firstDependencyIssue(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const { dependencies } = await listDependencies(viewer, parsed.data)
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(buildDependencyCsv(dependencies), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dependency-map-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return dependencyErrorResponse(error)
  }
})
