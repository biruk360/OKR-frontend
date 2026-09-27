'use client'

import { useRouter } from 'next/navigation'

/** Jump between the projects in this client's portal scope (shown only with more than one). */
export default function PortalProjectSwitcher({
  currentId,
  projects,
}: {
  currentId: string
  projects: Array<{ id: string; code: string; name: string }>
}) {
  const router = useRouter()
  if (projects.length < 2) return null
  return (
    <label className="flex items-center gap-2 text-body-sm text-ink-secondary">
      <span>Project</span>
      <select
        className="input h-9 max-w-[280px]"
        value={currentId}
        onChange={(event) => router.push(`/portal/projects/${event.target.value}`)}
        aria-label="Switch project"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
        ))}
      </select>
    </label>
  )
}
