'use client'

/**
 * Route-segment error boundary body for the OKR reporting pages (reports,
 * analytics, progress, hierarchy, alignment map, timeline, filters, initiative
 * report). Same reporting + stale-chunk recovery as app/dashboard/error.tsx,
 * but scoped: the sidebar/shell stays usable and the copy names the section.
 *
 * Usage (app/dashboard/<segment>/error.tsx):
 *   export default function Error(props) {
 *     return <SectionError {...props} section="Reports" />
 *   }
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { reportClientError } from '@/lib/client-error-report'
import { isStaleChunkRejection, reloadOnceForStaleChunks } from '@/lib/stale-chunk-reload'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'

export interface SectionErrorProps {
  error: Error & { digest?: string }
  reset: () => void
  /** Human name of the section, e.g. "Reports". */
  section: string
}

export function SectionError({ error, reset, section }: SectionErrorProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (isStaleChunkRejection(error)) reloadOnceForStaleChunks()
  }, [error])

  useEffect(() => {
    reportClientError({
      source: `react-error-boundary.${section.toLowerCase().replace(/\s+/g, '-')}`,
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      route: pathname,
    })
  }, [error, error.digest, error.message, error.stack, pathname, section])

  return (
    <div className="p-5">
      <EmptyState
        icon={AlertTriangle}
        title={`${section} could not be loaded`}
        description={
          error.digest
            ? `Something went wrong while loading this page. Reference: ${error.digest}`
            : 'Something went wrong while loading this page. Try again, or refresh the browser.'
        }
        action={<Button onClick={() => reset()}>Try again</Button>}
      />
    </div>
  )
}

export default SectionError
