'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { performanceApi } from '../services/api'
import type { CycleIssueStatus, PanelMember } from '../types'

/** Extract an id-list detail (e.g. `evaluationIds`, `evaluatorIds`) from an API error, if present. */
export function getErrorDetailIds(error: unknown, key: string): string[] | null {
  const details = (error as { details?: unknown } | null)?.details
  if (!details || typeof details !== 'object') return null
  const value = (details as Record<string, unknown>)[key]
  return Array.isArray(value) ? value.map(String) : null
}

const KEYS = {
  me: ['performance', 'me'] as const,
  templates: ['performance', 'templates'] as const,
  template: (id: string) => ['performance', 'template', id] as const,
  cycles: ['performance', 'cycles'] as const,
  cycle: (id: string) => ['performance', 'cycle', id] as const,
  calibration: (id: string) => ['performance', 'calibration', id] as const,
  evaluations: ['performance', 'evaluations'] as const,
  evaluation: (id: string) => ['performance', 'evaluation', id] as const,
  metricActual: (evaluationId: string, criterionId: string) => ['performance', 'metric-actual', evaluationId, criterionId] as const,
}

export function useMyPerformance() {
  return useQuery({ queryKey: KEYS.me, queryFn: performanceApi.getMyPerformance })
}

export function useUpdateWeeklyStep() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, weeklyStep }: { id: string; weeklyStep: string }) => performanceApi.updateWeeklyStep(id, weeklyStep),
    onSuccess: () => { client.invalidateQueries({ queryKey: KEYS.me }); toast.success('Weekly step saved') },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function usePerformanceTemplates() {
  return useQuery({ queryKey: KEYS.templates, queryFn: performanceApi.listTemplates })
}

export function usePerformanceTemplate(id: string) {
  return useQuery({ queryKey: KEYS.template(id), queryFn: () => performanceApi.getTemplate(id), enabled: !!id })
}

export function useCreatePerformanceTemplate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: performanceApi.createTemplate,
    onSuccess: () => client.invalidateQueries({ queryKey: KEYS.templates }),
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useTemplateMappings() {
  return useQuery({ queryKey: ['performance', 'template-mappings'], queryFn: performanceApi.listTemplateMappings })
}

export function useSaveTemplateMapping() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: performanceApi.saveTemplateMapping,
    onSuccess: () => { client.invalidateQueries({ queryKey: ['performance', 'template-mappings'] }); toast.success('Role mapping saved') },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useDeleteTemplateMapping() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: performanceApi.deleteTemplateMapping,
    onSuccess: () => client.invalidateQueries({ queryKey: ['performance', 'template-mappings'] }),
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useMetricMappings(templateId: string) {
  return useQuery({
    queryKey: ['performance', 'metric-mappings', templateId],
    queryFn: () => performanceApi.listMetricMappings(templateId),
    enabled: !!templateId,
  })
}

export function useMetricKeyResults(employeeId: string) {
  return useQuery({
    queryKey: ['performance', 'metric-key-results', employeeId],
    queryFn: () => performanceApi.listMetricKeyResults(employeeId),
    enabled: !!employeeId,
  })
}

export function useSaveMetricMappings(templateId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: performanceApi.saveMetricMappings,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['performance', 'metric-mappings', templateId] })
      toast.success('Metric sources saved')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useSaveTemplateBuilder(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (tiers: unknown[]) => performanceApi.saveBuilder(id, tiers),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: KEYS.template(id) })
      client.invalidateQueries({ queryKey: KEYS.templates })
      toast.success('Template builder saved')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useInsertCultureBlock(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (tierId: string) => performanceApi.insertCultureBlock(id, tierId),
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: KEYS.template(id) })
      client.invalidateQueries({ queryKey: KEYS.templates })
      toast.success(result.inserted > 0 ? `Inserted ${result.inserted} culture criteria` : 'Culture block already present')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useTemplateTransition() {
  const client = useQueryClient()
  const onSuccess = () => {
    client.invalidateQueries({ queryKey: ['performance', 'template'] })
    client.invalidateQueries({ queryKey: KEYS.templates })
  }
  return {
    publish: useMutation({ mutationFn: performanceApi.publishTemplate, onSuccess, onError: (error: Error) => toast.error(error.message) }),
    archive: useMutation({ mutationFn: performanceApi.archiveTemplate, onSuccess, onError: (error: Error) => toast.error(error.message) }),
    fork: useMutation({ mutationFn: performanceApi.forkTemplate, onSuccess, onError: (error: Error) => toast.error(error.message) }),
  }
}

export function useReviewCycles() {
  return useQuery({ queryKey: KEYS.cycles, queryFn: performanceApi.listCycles })
}

export function useCreateReviewCycle() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: performanceApi.createCycle,
    onSuccess: () => client.invalidateQueries({ queryKey: KEYS.cycles }),
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useOpenReviewCycle() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: performanceApi.openCycle,
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: ['performance'] })
      toast.success(`Cycle opened: ${result.createdEvaluations} evaluations, ${result.issueCount} issues`)
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useReviewCycle(id: string, enabled = true) {
  return useQuery({ queryKey: KEYS.cycle(id), queryFn: () => performanceApi.getCycle(id), enabled: enabled && !!id })
}

export function useCloseReviewCycle() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, overrideReason }: { id: string; overrideReason?: string }) => performanceApi.closeCycle(id, overrideReason),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['performance'] })
      toast.success('Cycle closed')
    },
    onError: (error: Error) => {
      // Incomplete-evaluation 400s are handled by the caller via an override dialog.
      if (!getErrorDetailIds(error, 'evaluationIds')) toast.error(error.message)
    },
  })
}

export function useUpdateCycleIssue(cycleId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ issueId, status }: { issueId: string; status: CycleIssueStatus }) =>
      performanceApi.updateCycleIssue(cycleId, issueId, status),
    onSuccess: (_result, variables) => {
      client.invalidateQueries({ queryKey: KEYS.cycle(cycleId) })
      client.invalidateQueries({ queryKey: KEYS.cycles })
      toast.success(variables.status === 'WAIVED' ? 'Issue waived' : variables.status === 'RESOLVED' ? 'Issue resolved' : 'Issue reopened')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useSavePanel(evaluationId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ panel, confirmDiscardSubmitted }: { panel: PanelMember[]; confirmDiscardSubmitted?: boolean }) =>
      performanceApi.savePanel(evaluationId, panel, confirmDiscardSubmitted),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: KEYS.evaluation(evaluationId) })
      client.invalidateQueries({ queryKey: KEYS.evaluations })
      toast.success('Evaluator panel saved')
    },
    onError: (error: Error) => {
      // Submitted-evaluator 400s are handled by the caller via a confirm dialog.
      if (!getErrorDetailIds(error, 'evaluatorIds')) toast.error(error.message)
    },
  })
}

export function useCalibrationDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.calibration(id),
    queryFn: () => performanceApi.getCalibration(id),
    enabled: enabled && !!id,
    retry: false,
  })
}

export function useRetryConsolidation(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => performanceApi.retryConsolidation(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['performance'] })
      toast.success('Consolidation completed')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useEvaluations() {
  return useQuery({ queryKey: KEYS.evaluations, queryFn: performanceApi.listEvaluations })
}

export function useEvaluation(id: string) {
  return useQuery({ queryKey: KEYS.evaluation(id), queryFn: () => performanceApi.getEvaluation(id), enabled: !!id })
}

export function useMetricActual(evaluationId: string, criterionId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.metricActual(evaluationId, criterionId),
    queryFn: () => performanceApi.getMetricActual(evaluationId, criterionId),
    enabled: enabled && !!evaluationId && !!criterionId,
  })
}

export function useSaveScores(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (scores: Array<{ criterionId: string; score: number; remark?: string }>) => performanceApi.saveScores(id, scores),
    onSuccess: () => client.invalidateQueries({ queryKey: KEYS.evaluation(id) }),
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useSubmitEvaluation(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => performanceApi.submitEvaluation(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['performance'] })
      toast.success('Evaluation submitted')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useEvaluationResponse(id: string) {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: ['performance'] })
  return {
    acknowledge: useMutation({
      mutationFn: (comment?: string) => performanceApi.acknowledgeEvaluation(id, comment),
      onSuccess: () => { invalidate(); toast.success('Report acknowledged') },
      onError: (error: Error) => toast.error(error.message),
    }),
    dispute: useMutation({
      mutationFn: (comment: string) => performanceApi.disputeEvaluation(id, comment),
      onSuccess: () => { invalidate(); toast.success('Dispute submitted for calibration') },
      onError: (error: Error) => toast.error(error.message),
    }),
  }
}

export function useEvaluationWorkflow(id: string) {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: ['performance'] })
  const onError = (error: Error) => toast.error(error.message)
  return {
    calibrate: useMutation({
      mutationFn: (notes: Array<{ criterionId: string; note: string }>) => performanceApi.resolveCalibration(id, notes),
      onSuccess: () => { invalidate(); toast.success('Calibration resolved') },
      onError,
    }),
    share: useMutation({
      mutationFn: () => performanceApi.shareDraft(id),
      onSuccess: () => { invalidate(); toast.success('Draft shared with employee') },
      onError,
    }),
    finalize: useMutation({
      mutationFn: (overrideReason?: string) => performanceApi.finalizeEvaluation(id, overrideReason),
      onSuccess: () => { invalidate(); toast.success('Evaluation finalized') },
      onError,
    }),
  }
}

export function useDevelopmentActions() {
  return useQuery({ queryKey: ['performance', 'actions'], queryFn: performanceApi.listActions })
}

export function useTransitionDevelopmentAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason: string }) => performanceApi.transitionAction(id, status, reason),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['performance', 'actions'] }); toast.success('Development action updated') },
    onError: (error: Error) => toast.error(error.message),
  })
}
