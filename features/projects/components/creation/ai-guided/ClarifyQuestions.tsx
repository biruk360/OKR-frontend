'use client'

import { useForm } from 'react-hook-form'
import { ArrowLeft, HelpCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NormalizedProjectCreationDraft } from '@/lib/projects/creation-normalize'
import { AI_GUIDED_IDS } from '@/lib/projects/ai-guided-ids'

type Question = NormalizedProjectCreationDraft['questions'][number]
type Assumption = NormalizedProjectCreationDraft['assumptions'][number]

interface ClarifyQuestionsProps {
  questions: Question[]
  assumptions: Assumption[]
  busy: boolean
  onSubmit: (input: { answers: Array<{ questionId: string; answer: string | null }>; continueWithAssumptions: boolean }) => Promise<void>
  onBack: () => void
}

const IMPACT_STYLE: Record<Question['impact'], string> = {
  HIGH: 'bg-danger-50 text-danger-700',
  MEDIUM: 'bg-warning-50 text-warning-700',
  LOW: 'bg-surface-muted text-ink-secondary',
}

function assumptionFor(questionId: string, assumptions: Assumption[]) {
  const id = `${AI_GUIDED_IDS.clarifyAssumption}${questionId.slice(AI_GUIDED_IDS.clarifyQuestion.length)}`
  return assumptions.find((assumption) => assumption.id === id) ?? null
}

/**
 * Story 3.3 — at most five high-impact questions per round. The user may answer
 * any of them or continue; every assumption that will be used is listed first.
 */
export function ClarifyQuestions({ questions, assumptions, busy, onSubmit, onBack }: ClarifyQuestionsProps) {
  const { register, handleSubmit, watch } = useForm<{ answers: Record<string, string> }>({
    defaultValues: { answers: Object.fromEntries(questions.map((question) => [question.id, question.answer ?? ''])) },
  })
  const answers = watch('answers')
  const unanswered = questions.filter((question) => !answers?.[question.id]?.trim())

  const submit = (continueWithAssumptions: boolean) => handleSubmit(async (values) => {
    await onSubmit({
      answers: questions.map((question) => ({ questionId: question.id, answer: values.answers[question.id]?.trim() || null })),
      continueWithAssumptions,
    })
  })

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-section-title text-ink-primary">A few questions before planning</h3>
        <p className="mt-1 text-body text-ink-secondary">
          Only questions that change scope, dates, deliverables, ownership, or dependencies are asked. Answer what you can, or continue with the listed assumptions.
        </p>
      </div>

      <ol className="space-y-3">
        {questions.map((question, index) => {
          const assumption = assumptionFor(question.id, assumptions)
          return (
            <li key={question.id} className="rounded-card border border-border bg-surface-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <HelpCircle className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-medium text-ink-primary">{index + 1}. {question.text}</span>
                    <span className={cn('rounded-pill px-2 py-0.5 text-xs font-semibold', IMPACT_STYLE[question.impact])}>{question.impact.toLowerCase()} impact</span>
                  </div>
                  <textarea
                    rows={2}
                    aria-label={`Answer to question ${index + 1}`}
                    placeholder="Your answer (optional)"
                    className="input"
                    {...register(`answers.${question.id}`, { maxLength: { value: 2_000, message: 'Keep under 2,000 characters' } })}
                  />
                  {assumption && (
                    <p className="text-body-sm text-ink-tertiary">
                      If unanswered, AI plans with: <span className="text-ink-secondary">{assumption.text.replace(/^If unanswered: /, '')}</span>
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {unanswered.length > 0 && (
        <div className="rounded-card border border-warning-500/30 bg-warning-50 p-4">
          <p className="text-body-sm font-semibold text-ink-primary">Continuing now uses {unanswered.length} assumption{unanswered.length === 1 ? '' : 's'}:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink-secondary">
            {unanswered.map((question) => {
              const assumption = assumptionFor(question.id, assumptions)
              return <li key={question.id}>{assumption ? assumption.text.replace(/^If unanswered: /, '') : question.text}</li>
            })}
          </ul>
          <p className="mt-2 text-body-sm text-ink-tertiary">Each stays listed in Assumptions &amp; Questions and must be accepted or rejected before the project can be created.</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft data-icon="inline-start" /> Edit brief
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={submit(true)}>
            Continue with assumptions
          </Button>
          <Button type="button" disabled={busy || unanswered.length === questions.length} onClick={submit(true)}>
            <Sparkles data-icon="inline-start" /> {busy ? 'Generating plan…' : 'Use answers and generate'}
          </Button>
        </div>
      </div>
    </div>
  )
}
