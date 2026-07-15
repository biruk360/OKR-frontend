'use client'

import { useState } from 'react'
import { AlertTriangle, Bot, Copy, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useAiAssistant, type AiAssistantResponseNode } from '../../hooks/useProject'

const INTENTS: { value: AiAssistantResponseNode['intent']; label: string; description: string }[] = [
  { value: 'EXECUTIVE_SUMMARY', label: 'Executive summary', description: 'Capped, data-grounded project health summary' },
  { value: 'RISK_DETECTION', label: 'Risk detection', description: 'Unassigned work, high risks, overdue dependencies' },
  { value: 'DELAY_PATTERN', label: 'Delay patterns', description: 'Where delays cluster by phase, owner, and reason' },
  { value: 'ESTIMATE_SUGGESTION', label: 'Estimate suggestions', description: 'Calibrate estimates from historical actuals' },
]

const MAX_CONTEXT = 500

export function AiAssistantPanel({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [intent, setIntent] = useState<AiAssistantResponseNode['intent']>('EXECUTIVE_SUMMARY')
  const [context, setContext] = useState('')
  const [result, setResult] = useState<AiAssistantResponseNode | null>(null)
  const [copied, setCopied] = useState(false)
  const assistant = useAiAssistant(projectId)

  const generate = async () => {
    setResult(null)
    const response = await assistant.mutateAsync({ intent, context: context.trim() || undefined })
    setResult(response)
  }

  const copyOutput = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Constrained AI Assistant"
      icon={Bot}
      iconClassName="text-indigo-500"
      size="lg"
      scrollBehavior="internal"
      footer={(
        <>
          <button className="btn btn-outline" onClick={onClose} disabled={assistant.isPending}>Close</button>
          <button className="btn btn-primary" onClick={generate} disabled={assistant.isPending}>
            <Sparkles className="mr-1 size-3.5" /> {assistant.isPending ? 'Generating…' : 'Generate'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-body-sm text-indigo-800">
          This assistant only reads existing project data. It cannot write requirements, produce client-facing prose, or send anything. All outputs are capped and require PM review before external use.
        </div>

        <div>
          <label className="mb-1.5 block text-body-sm font-medium text-ink-primary">Intent</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {INTENTS.map((item) => (
              <button
                key={item.value}
                onClick={() => setIntent(item.value)}
                className={cn(
                  'rounded-card border p-3 text-left transition-colors',
                  intent === item.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-black/[0.08] bg-white hover:bg-surface-hover',
                )}
              >
                <div className="text-body-sm font-medium text-ink-primary">{item.label}</div>
                <div className="text-[12px] text-ink-tertiary">{item.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-body-sm font-medium text-ink-primary">Optional context</label>
          <textarea
            className="input min-h-20 w-full text-body-sm"
            placeholder="Add brief context (e.g. focus on deployment phase). Forbidden: write requirements, send to client, auto-send."
            maxLength={MAX_CONTEXT}
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
          <div className="mt-1 text-right text-[12px] text-ink-tertiary">{context.length}/{MAX_CONTEXT}</div>
        </div>

        {result && (
          <div className="rounded-card border border-black/[0.08] bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-body-sm font-medium text-ink-primary">{INTENTS.find((i) => i.value === result.intent)?.label}</div>
              <div className="flex items-center gap-2">
                <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-medium', result.capped ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700')}>
                  {result.capped ? `Within cap (${result.bullets} bullets, ${result.chars} chars)` : 'Over cap'}
                </span>
                <button className="btn btn-outline btn-xs" onClick={copyOutput}>
                  <Copy className="mr-1 size-3" /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="whitespace-pre-line rounded-md bg-surface-secondary p-3 text-body-sm text-ink-primary">
              {result.output}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-md bg-warning-50 p-2 text-[12px] text-warning-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>PM approval required before external use. This output is not client-ready and cannot be auto-sent.</span>
            </div>
            <div className="mt-2 text-[12px] text-ink-tertiary">
              Grounded in: {result.groundedIn.join(' · ')}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
