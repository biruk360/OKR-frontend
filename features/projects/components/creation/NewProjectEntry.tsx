'use client'

import { ArrowRight, FileUp, PencilLine, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProjectCreationSourceMethod } from '@/lib/projects/creation-draft'
import {
  getProjectCreationMethodOptions,
  projectCreationMethodLabel,
  type ProjectCreationMethodKey,
} from './methods'
import { ImportTemplateDownloads } from './ImportTemplateDownloads'

interface NewProjectEntryProps {
  aiFeatureEnabled: boolean
  aiAvailable: boolean
  currentDraftMethod?: ProjectCreationSourceMethod | null
  isStarting?: boolean
  onSelect: (method: ProjectCreationSourceMethod) => void
  onResume?: () => void
}

const METHOD_ICONS = {
  manual: PencilLine,
  import: FileUp,
  ai: Sparkles,
} satisfies Record<ProjectCreationMethodKey, typeof PencilLine>

export function NewProjectEntry({
  aiFeatureEnabled,
  aiAvailable,
  currentDraftMethod,
  isStarting = false,
  onSelect,
  onResume,
}: NewProjectEntryProps) {
  const methods = getProjectCreationMethodOptions({ aiFeatureEnabled, aiAvailable })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-section-title text-ink-primary">How would you like to start?</h2>
        <p className="mt-1 text-body text-ink-secondary">
          Every method creates a private draft. Nothing becomes a project until you review and confirm it.
        </p>
      </div>

      {currentDraftMethod && onResume && (
        <div className="flex flex-col gap-3 rounded-card border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-body font-semibold text-ink-primary">Saved draft available</p>
            <p className="text-body-sm text-ink-secondary">
              Continue your {projectCreationMethodLabel(currentDraftMethod).toLowerCase()} draft without losing progress.
            </p>
          </div>
          <Button type="button" onClick={onResume}>
            Resume draft <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      )}

      <div className={cn('grid gap-4', methods.length === 3 ? 'lg:grid-cols-3' : 'sm:grid-cols-2')}>
        {methods.map((method) => {
          const Icon = METHOD_ICONS[method.key]
          const disabled = isStarting || !method.available
          return (
            <button
              key={method.key}
              type="button"
              disabled={disabled}
              aria-label={method.available ? method.title : `${method.title}: unavailable`}
              onClick={() => onSelect(method.sourceMethod)}
              className={cn(
                'group flex min-h-72 flex-col rounded-card border border-border bg-surface-card p-5 text-left shadow-card',
                'transition-all duration-[180ms] ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                method.available
                  ? 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover'
                  : 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <span className="mt-5 text-section-title text-ink-primary">{method.title}</span>
              <span className="mt-2 text-body text-ink-secondary">{method.description}</span>
              <span className="mt-4 text-body-sm text-ink-tertiary">
                <span className="font-semibold text-ink-secondary">Best for: </span>{method.bestFor}
              </span>
              <span className={cn(
                'mt-auto flex items-center gap-1.5 pt-6 text-body-sm font-semibold',
                method.available ? 'text-primary' : 'text-warning-700',
              )}>
                {method.available ? (
                  <>Start this way <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>
                ) : method.unavailableReason}
              </span>
            </button>
          )
        })}
      </div>

      <ImportTemplateDownloads context="entry" />

      {isStarting && (
        <div role="status" className="rounded-card bg-surface-muted px-4 py-3 text-body-sm text-ink-secondary animate-pulse">
          Creating your private draft…
        </div>
      )}
    </div>
  )
}
