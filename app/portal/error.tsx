'use client'

import { ProjectRouteError } from '@/features/projects/components/RouteStates'

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ProjectRouteError error={error} reset={reset} source="portal" showMessage={false} />
}
