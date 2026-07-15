/**
 * Performance-module integration point for PM Jira evidence.
 *
 * G4 deliberately exposes the same computed data to Performance instead of
 * persisting a second copy. Evaluations/reports can import this helper and
 * apply their own cycle/date window.
 */
export {
  getJiraDeveloperMetrics as getProjectJiraPerformanceMetrics,
  computeJiraDeveloperMetrics,
  estimateBias,
  median,
  type JiraDeveloperMetric,
  type JiraDeveloperMetricsResult,
  type EstimateBias,
} from '@/features/projects/services/jira/metrics'
