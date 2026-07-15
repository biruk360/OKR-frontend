/**
 * Performance-module import surface for Project R3/R4 reports.
 *
 * Review-cycle metric criteria can call these helpers to auto-pull the exact
 * project evidence used by PM performance reports instead of duplicating Jira or
 * scrum calculations.
 */
export {
  buildPerformanceReportContent,
  generatePerformanceReports,
  listPerformanceReports,
  performancePeriod,
  type IndividualPerformanceContent,
  type IndividualPerformanceRow,
  type PerformanceCadence,
  type TeamPerformanceContent,
} from '@/lib/projects/performance-reports'
