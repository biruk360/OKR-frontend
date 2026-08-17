'use client'

import { useState, type ReactNode } from 'react'
import { ArrowLeft, Check, FileUp, PencilLine, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import type { ProjectCreationDraftNode } from '../../hooks/useProjects'
import { projectCreationMethodLabel } from './methods'

interface CreationDraftShellProps {
  draft: ProjectCreationDraftNode
  onBack: () => void
  onSaveExit: () => void
  onDiscard: () => Promise<void>
  isDiscarding?: boolean
  progressStep?: 1 | 2 | 3
  children?: ReactNode
}

const STEPS = ['Method', 'Prepare', 'Review', 'Create'] as const

const METHOD_CONTENT = {
  MANUAL: {
    icon: PencilLine,
    title: 'Manual project setup',
    description: 'Your common project details are preserved in this draft. Continue with a blank schedule or lifecycle template.',
  },
  FILE_IMPORT: {
    icon: FileUp,
    title: 'File import setup',
    description: 'Your draft is ready for CSV, Excel, or Word input. Source content will remain separate from production project data.',
  },
  AI_GUIDED: {
    icon: Sparkles,
    title: 'AI-guided setup',
    description: 'Your draft is ready for a guided brief. Every generated value will remain editable and require confirmation.',
  },
  AI_TOR: {
    icon: Sparkles,
    title: 'TOR-guided setup',
    description: 'Your draft is ready for TOR input. Document content will be treated as untrusted project data.',
  },
} as const

export function CreationDraftShell({
  draft,
  onBack,
  onSaveExit,
  onDiscard,
  isDiscarding = false,
  progressStep = 1,
  children,
}: CreationDraftShellProps) {
  const [discardOpen, setDiscardOpen] = useState(false)
  const content = METHOD_CONTENT[draft.sourceMethod]
  const Icon = content.icon

  const confirmDiscard = async () => {
    await onDiscard()
    setDiscardOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-body font-semibold text-ink-primary">{projectCreationMethodLabel(draft.sourceMethod)}</p>
            <p className="text-body-sm text-ink-tertiary">Private draft · Version {draft.version} · Saved</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          Change method
        </Button>
      </div>

      <ol aria-label="Project creation progress" className="grid grid-cols-4 gap-2">
        {STEPS.map((step, index) => {
          const complete = index < progressStep
          const current = index === progressStep
          return (
            <li key={step} className="min-w-0">
              <div className={cn('h-1 rounded-pill', complete || current ? 'bg-primary' : 'bg-surface-muted')} />
              <div className="mt-2 flex items-center gap-1.5">
                <span className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  complete || current ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-ink-tertiary',
                )}>
                  {complete ? <Check className="size-3" /> : index + 1}
                </span>
                <span className={cn('truncate text-body-sm', current ? 'font-semibold text-ink-primary' : 'text-ink-tertiary')}>
                  {step}
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      {children ?? <div className="rounded-card border border-border bg-surface-card p-6 shadow-card">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-700">
            <Save className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <h3 className="text-section-title text-ink-primary">{content.title}</h3>
            <p className="mt-1 text-body text-ink-secondary">{content.description}</p>
            <p className="mt-3 text-body-sm text-ink-tertiary">
              You can return to methods or leave this screen. The saved draft remains private and no project rows are created.
            </p>
          </div>
        </div>
      </div>}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" /> Back to methods
          </Button>
          <Button type="button" variant="destructive" onClick={() => setDiscardOpen(true)}>
            <Trash2 data-icon="inline-start" /> Discard draft
          </Button>
        </div>
        {!children && (
          <Button type="button" onClick={onSaveExit}>
            <Save data-icon="inline-start" /> Save and exit
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={confirmDiscard}
        title="Discard project draft?"
        message="This saved draft will be permanently discarded."
        description="No production project data will be changed."
        confirmLabel="Discard draft"
        isLoading={isDiscarding}
        loadingLabel="Discarding"
        variant="danger"
      />
    </div>
  )
}
