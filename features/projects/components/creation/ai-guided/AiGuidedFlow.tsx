'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { PencilLine, RefreshCw, Save, ShieldOff, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
} from '@/lib/projects/creation-normalize'
import { readAiGuidedBrief, type AiGuidedBrief } from '@/lib/projects/ai-guided-brief'
import { AI_GUIDED_IDS } from '@/lib/projects/ai-guided-ids'
import type { CommitProjectCreationDraftResult } from '@/lib/projects/creation-commit-shared'
import type { ProjectCreationDraftNode } from '../../../hooks/useProjects'
import { DraftReviewWorkspace } from '../DraftReviewWorkspace'
import { AiBriefStep, type AiBriefAction } from './AiBriefStep'
import { ClarifyQuestions } from './ClarifyQuestions'
import { AiRevisionPanel } from './AiRevisionPanel'
import {
  AiGuidedRequestError,
  useAnswerAiGuidedQuestions,
  useClarifyAiGuidedDraft,
  useGenerateAiGuidedDraft,
  useReloadAiGuidedDraft,
  useSaveAiGuidedBrief,
  useUploadAiGuidedTor,
} from './useAiGuided'

interface AiGuidedFlowProps {
  draft: ProjectCreationDraftNode
  aiFeatureEnabled: boolean
  aiAvailable: boolean
  onDraftUpdated: (draft: ProjectCreationDraftNode) => void
  onProgressChange: (step: 1 | 2 | 3) => void
  onSaveExit: () => void
  onCommitted: (project: CommitProjectCreationDraftResult) => Promise<void> | void
}

/**
 * Option C — Create with AI (requirements §9, Stories 3.1–3.7).
 * Brief/TOR → optional clarification → schema-validated generation into the
 * SAME normalized draft as Manual/Import → shared DraftReviewWorkspace, where
 * every AI row is marked and must be accepted → the existing commit path.
 */
export function AiGuidedFlow({
  draft,
  aiFeatureEnabled,
  aiAvailable,
  onDraftUpdated,
  onProgressChange,
  onSaveExit,
  onCommitted,
}: AiGuidedFlowProps) {
  const normalized = useMemo(() => combineNormalizedProjectCreationDraft(
    draft.projectJson,
    draft.scheduleJson ?? createEmptyProjectCreationScheduleJson(),
    draft.validationJson ?? createEmptyProjectCreationValidationJson(),
  ), [draft])
  const brief = useMemo(() => readAiGuidedBrief(normalized), [normalized])
  const openQuestions = normalized.questions.filter((question) => question.id.startsWith(AI_GUIDED_IDS.clarifyQuestion) && question.status === 'OPEN')
  const hasSchedule = normalized.activities.length > 0 || normalized.phases.length > 0
  const [editingBrief, setEditingBrief] = useState(false)
  const [busyAction, setBusyAction] = useState<AiBriefAction | null>(null)
  const [refused, setRefused] = useState(!aiFeatureEnabled)
  const [conflicted, setConflicted] = useState(false)
  const [regenerateBrief, setRegenerateBrief] = useState<AiGuidedBrief | null>(null)
  const [reviewEpoch, setReviewEpoch] = useState(0)
  const saveBrief = useSaveAiGuidedBrief(draft.id)
  const clarify = useClarifyAiGuidedDraft(draft.id)
  const answer = useAnswerAiGuidedQuestions(draft.id)
  const generate = useGenerateAiGuidedDraft(draft.id)
  const reload = useReloadAiGuidedDraft(draft.id)
  const uploadTor = useUploadAiGuidedTor(draft.id)
  const generating = generate.isPending || clarify.isPending || answer.isPending

  const stage: 'brief' | 'questions' | 'review' = editingBrief || !brief
    ? 'brief'
    : openQuestions.length > 0 && !hasSchedule
    ? 'questions'
    : hasSchedule
    ? 'review'
    : 'brief'

  useEffect(() => {
    onProgressChange(stage === 'review' ? 2 : 1)
  }, [stage, onProgressChange])

  useEffect(() => {
    if (!aiFeatureEnabled) setRefused(true)
  }, [aiFeatureEnabled])

  const handleError = (error: AiGuidedRequestError) => {
    if (error.code === 'PROJECT_CREATION_AI_DISABLED') {
      setRefused(true)
      return
    }
    if (error.status === 409 && (error.details as { reasonCode?: string } | undefined)?.reasonCode === 'PROJECT_CREATION_DRAFT_VERSION_CONFLICT') {
      setConflicted(true)
    }
    toast.error(error.message)
  }

  const replaceDraft = (next: ProjectCreationDraftNode) => {
    onDraftUpdated(next)
    setReviewEpoch((value) => value + 1)
  }

  const runGenerate = async (version: number, replaceExisting: boolean) => {
    const result = await generate.mutateAsync({ version, replaceExisting })
    replaceDraft(result.draft)
    setEditingBrief(false)
    toast.success(`AI proposed ${result.summary.phases} phases and ${result.summary.activities} activities. Review and accept them before creating the project.`)
  }

  const submitBrief = async (nextBrief: AiGuidedBrief, action: AiBriefAction) => {
    if (action === 'GENERATE' && hasSchedule) {
      setRegenerateBrief(nextBrief)
      return
    }
    setBusyAction(action)
    try {
      const saved = await saveBrief.mutateAsync({ version: draft.version, brief: nextBrief })
      onDraftUpdated(saved.draft)
      if (action === 'SAVE') {
        toast.success('Brief saved to your private draft')
        return
      }
      if (action === 'CLARIFY') {
        const result = await clarify.mutateAsync({ version: saved.draft.version })
        onDraftUpdated(result.draft)
        setEditingBrief(false)
        if (result.questionsAdded === 0) toast.success('No clarification needed. You can generate the plan.')
        return
      }
      await runGenerate(saved.draft.version, false)
    } catch (error) {
      handleError(error as AiGuidedRequestError)
    } finally {
      setBusyAction(null)
    }
  }

  const confirmRegenerate = async () => {
    if (!regenerateBrief) return
    setBusyAction('GENERATE')
    try {
      const saved = await saveBrief.mutateAsync({ version: draft.version, brief: regenerateBrief })
      onDraftUpdated(saved.draft)
      await runGenerate(saved.draft.version, true)
    } catch (error) {
      handleError(error as AiGuidedRequestError)
    } finally {
      setRegenerateBrief(null)
      setBusyAction(null)
    }
  }

  const submitTorUpload = async (file: File) => {
    try {
      const result = await uploadTor.mutateAsync({ version: draft.version, file })
      onDraftUpdated(result.draft)
      return { torText: result.torText, truncated: result.truncated }
    } catch (error) {
      handleError(error as AiGuidedRequestError)
      return null
    }
  }

  const submitAnswers = async (input: { answers: Array<{ questionId: string; answer: string | null }>; continueWithAssumptions: boolean }) => {
    try {
      const answered = await answer.mutateAsync({ version: draft.version, ...input })
      onDraftUpdated(answered.draft)
      await runGenerate(answered.draft.version, false)
    } catch (error) {
      handleError(error as AiGuidedRequestError)
    }
  }

  const reloadDraft = async () => {
    try {
      const latest = await reload.mutateAsync()
      replaceDraft(latest)
      setConflicted(false)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (refused) {
    return (
      <div className="rounded-card border border-border bg-surface-card p-6 shadow-card">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-secondary">
            <ShieldOff className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <h3 className="text-section-title text-ink-primary">AI-assisted creation is turned off</h3>
            <p className="mt-1 text-body text-ink-secondary">
              An Administrator has disabled AI project creation, so no AI request can be sent. Your draft and brief are kept. Use “Change method” to continue with Manual creation or Import — common project details are preserved.
            </p>
            <Button type="button" className="mt-4" onClick={onSaveExit}><Save data-icon="inline-start" /> Save and exit</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {conflicted && (
        <div className="flex flex-col gap-3 rounded-card border border-warning-500/30 bg-warning-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm text-ink-primary">This draft changed in another tab or window. Reload the latest saved version before continuing.</p>
          <Button type="button" size="sm" variant="outline" onClick={reloadDraft} disabled={reload.isPending}>
            <RefreshCw data-icon="inline-start" /> Reload draft
          </Button>
        </div>
      )}

      {generating && busyAction !== 'SAVE' ? (
        <div className="space-y-4 rounded-card border border-border bg-surface-card p-6 shadow-card" aria-live="polite" aria-label="AI is preparing the plan">
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 animate-pulse text-primary" strokeWidth={1.75} />
            <p className="text-body font-medium text-ink-primary">
              {clarify.isPending ? 'Checking the brief for high-impact gaps…' : 'Preparing an editable plan. This can take up to a minute.'}
            </p>
          </div>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
          <p className="text-body-sm text-ink-tertiary">Your draft is already saved. If AI fails, nothing changes and you can continue manually.</p>
        </div>
      ) : stage === 'brief' ? (
        <AiBriefStep
          key={`brief-${draft.id}-${reviewEpoch}`}
          brief={brief}
          defaults={{
            name: normalized.project.name,
            clientName: normalized.project.clientName,
            plannedStart: normalized.project.plannedStart,
            plannedEnd: normalized.project.plannedEnd,
          }}
          aiAvailable={aiAvailable}
          hasSchedule={hasSchedule}
          busyAction={busyAction}
          onSubmit={submitBrief}
          onUploadTor={submitTorUpload}
          onSaveExit={onSaveExit}
          onCancelEdit={hasSchedule ? () => setEditingBrief(false) : undefined}
        />
      ) : stage === 'questions' ? (
        <ClarifyQuestions
          questions={openQuestions}
          assumptions={normalized.assumptions}
          busy={generating}
          onSubmit={submitAnswers}
          onBack={() => setEditingBrief(true)}
        />
      ) : (
        <div className="space-y-5">
          <AiRevisionPanel
            draft={draft}
            normalized={normalized}
            aiAvailable={aiAvailable}
            onDraftReplaced={replaceDraft}
            onRequestError={handleError}
          />
          <DraftReviewWorkspace
            key={`review-${draft.id}-${reviewEpoch}`}
            draft={draft}
            onDraftUpdated={onDraftUpdated}
            onSaveExit={onSaveExit}
            onRestartSource={() => setEditingBrief(true)}
            onCommitted={onCommitted}
            footerAction={(
              <Button type="button" variant="outline" onClick={() => setEditingBrief(true)}>
                <PencilLine data-icon="inline-start" /> Edit brief
              </Button>
            )}
          />
        </div>
      )}

      <ConfirmDialog
        open={regenerateBrief !== null}
        onClose={() => setRegenerateBrief(null)}
        onConfirm={confirmRegenerate}
        title="Regenerate the whole plan?"
        message="The current schedule, its AI proposals, and your edits to generated rows will be replaced by a new AI proposal."
        description="Your brief, clarification answers, and saved draft history are kept. To change only part of the plan, use a revision instruction instead."
        confirmLabel="Regenerate plan"
        isLoading={busyAction === 'GENERATE'}
        loadingLabel="Regenerating"
        variant="warning"
      />
    </div>
  )
}
