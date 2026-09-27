'use client'

import { ProjectRouteError } from '@/features/projects/components/RouteStates'

export default function ProjectWorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ProjectRouteError error={error} reset={reset} source="projects.workspace" />
}
