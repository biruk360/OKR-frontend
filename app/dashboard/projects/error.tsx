'use client'

import { ProjectRouteError } from '@/features/projects/components/RouteStates'

export default function ProjectsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ProjectRouteError error={error} reset={reset} source="projects" />
}
