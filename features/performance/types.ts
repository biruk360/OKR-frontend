export type PerformanceTemplateSummary = {
  id: string
  version: number
  status: string
  maxTotal: number
  publishedAt: string | null
  family: { id: string; name: string; roleLabel: string | null; isActive: boolean }
  _count: { tiers: number; evaluations: number }
}

export type PerformanceCriterion = {
  id: string
  type: 'RUBRIC' | 'METRIC'
  code: string | null
  title: string
  position: number
  maxPoints: number
  weight: number
  anchorJson: Record<string, unknown> | null
  unit: string | null
  periodLabel: string | null
  target: number | null
  scoringRuleJson: Record<string, unknown> | null
  krAggregation: string | null
}

export type PerformanceTier = {
  id: string
  name: string
  position: number
  maxPoints: number
  criteria: PerformanceCriterion[]
}

export type PerformanceTemplateDetail = {
  id: string
  version: number
  status: string
  maxTotal: number
  gatekeeperJson: Record<string, unknown>
  bandsJson: Array<Record<string, unknown>>
  family: {
    id: string
    name: string
    roleLabel: string | null
    templates: Array<{ id: string; version: number; status: string; publishedAt: string | null }>
  }
  tiers: PerformanceTier[]
}

export type ReviewCycleSummary = {
  id: string
  name: string
  cadence: string
  periodStart: string
  periodEnd: string
  status: string
  allCompany: boolean
  departments: Array<{ department: { id: string; name: string } }>
  _count: { evaluations: number; issues: number }
}

export type EvaluationSummary = {
  id: string
  status: string
  employee: { id: string; name: string; designation: string | null; avatar: string | null }
  cycle: { id: string; name: string; status: string; periodStart: string; periodEnd: string }
  template: { name: string; roleLabel: string | null }
  assignment: { evaluatorId: string; role: string; status: string; submittedAt: string | null } | null
  normalized?: number | null
  gatekeeperPass?: boolean | null
  decisionBand?: string | null
}

export type EvaluationDetail = {
  id: string
  status: string
  sealed?: boolean
  employee: { id: string; name: string; designation: string | null; avatar: string | null }
  cycle: { id: string; name: string; status: string; periodStart: string; periodEnd: string }
  template?: PerformanceTemplateDetail
  assignments?: Array<{ evaluatorId: string; role: string; status: string; submittedAt: string | null; evaluator: { id: string; name: string | null; avatar: string | null } }>
  scores?: Array<{ criterionId: string; evaluatorId: string; score: number; remark: string | null; lockedAt: string | null }>
  results?: Array<{ criterionId: string; consolidated: number; variance: number; flagged: boolean; actualValue: number | null; calibrationNote?: string | null; resolvedAt?: string | null }>
  report?: {
    id: string
    version: number
    status: string
    contentJson: {
      rawTotal?: number
      maxTotal?: number
      normalized?: number
      gatekeeperPass?: boolean
      decisionBand?: string
      tierBreakdown?: Array<{
        id: string
        name: string
        maxPoints: number
        subtotal: number
        criteria: Array<{ id: string; title: string; maxPoints: number; consolidated: number | null; feedbackSummary: string | null }>
      }>
    }
  } | null
  normalized?: number | null
  gatekeeperPass?: boolean | null
  decisionBand?: string | null
}

export type CycleIssueType = 'NO_TEMPLATE' | 'NO_LEAD' | 'AMBIGUOUS_LEAD' | 'METRIC_SOURCE_MISSING' | 'ACTUAL_UNAVAILABLE'
export type CycleIssueStatus = 'OPEN' | 'RESOLVED' | 'WAIVED'

export type ReviewCycleIssue = {
  id: string
  type: CycleIssueType
  status: CycleIssueStatus
  detailJson: Record<string, unknown> | null
  employeeId: string | null
  evaluationId: string | null
  createdAt: string
}

export type ReviewCycleDetail = {
  id: string
  name: string
  cadence: string
  periodStart: string
  periodEnd: string
  status: string
  allCompany: boolean
  departments: Array<{ department: { id: string; name: string } }>
  issues: ReviewCycleIssue[]
  evaluations: Array<{
    id: string
    status: string
    employee: { id: string; name: string | null; designation: string | null }
    template: { family: { name: string } }
    assignments: Array<{ evaluatorId: string; role: string; status: string; evaluator: { id: string; name: string | null } }>
  }>
}

export type PanelMember = { evaluatorId: string; role: 'LEAD' | 'EVALUATOR' }

export type PanelAssignment = {
  evaluationId: string
  evaluatorId: string
  role: string
  status: string
  submittedAt: string | null
  evaluator: { id: string; name: string | null }
}

export type CalibrationDetail = {
  id: string
  status: string
  assignments: Array<{ evaluatorId: string; role: string; status: string; evaluator: { id: string; name: string | null } }>
  scores: Array<{ criterionId: string; evaluatorId: string; score: number; remark: string | null }>
  results: Array<{
    criterionId: string
    consolidated: number
    variance: number
    flagged: boolean
    calibrationNote: string | null
    resolvedAt: string | null
    criterion: { id: string; title: string; maxPoints: number }
  }>
}

export type PerformanceMetricMapping = {
  id: string
  criterionId: string
  employeeId: string
  keyResultId: string
  position: number
  criterion: { id: string; title: string; type: string }
  employee: { id: string; name: string | null; designation: string | null }
  keyResult: {
    id: string
    title: string
    currentValue: number
    targetValue: number
    unit: string
    status: string
  }
}

export type MetricActual = {
  criterionId: string
  title: string
  actual: number | null
  target: number | null
  unit: string | null
  score: number | null
  sources: Array<{
    keyResultId: string
    title: string
    value: number
    asOfDate: string | null
    fallbackToCurrentValue: boolean
  }>
  unavailable: boolean
  reason?: string
}

// --- Report analytics additions (F2/G3) — appended only ---

export type PerformanceTrendPoint = {
  cycleId: string
  cycleName: string
  periodEnd: string
  normalized: number | null
}

export type OkrAttainmentKeyResult = {
  id: string
  title: string
  unit: string
  startValue: number
  targetValue: number
  currentValue: number
  progress: number
}

export type OkrAttainmentObjective = {
  id: string
  title: string
  progress: number
  timeframeName: string
  keyResults: OkrAttainmentKeyResult[]
}

export type OkrAttainment = {
  periodStart: string
  periodEnd: string
  objectives: OkrAttainmentObjective[]
}

/** Full shape of EvaluationReport.contentJson including analytics extensions. */
export type EvaluationReportContent = NonNullable<NonNullable<EvaluationDetail['report']>['contentJson']> & {
  trend?: PerformanceTrendPoint[]
  okrAttainment?: OkrAttainment
}

/** Extra fields returned by /api/performance/me beyond the base client type. */
export type MyPerformanceChartData = {
  latestReport?: {
    evaluationId: string
    cycleName: string
    contentJson: EvaluationReportContent
  } | null
  evaluations?: Array<{
    id: string
    status: string
    sealed?: boolean
    normalized?: number | null
    cycle: { id: string; name: string; periodStart?: string; periodEnd?: string; status?: string }
  }>
}
