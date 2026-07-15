import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_ASSISTANT_FORBIDDEN_INTENTS,
  AI_ASSISTANT_INTENTS,
  buildGroundedResponse,
  classifyIntent,
  detectForbiddenContext,
  enforceAssistantCaps,
  isAllowedIntent,
  isForbiddenIntent,
  validateAssistantOutput,
} from './ai-assistant'
import { AI_SUMMARY_MAX_BULLETS, AI_SUMMARY_MAX_CHARS } from '../../features/projects/types'
import type { AssistantFacts } from './ai-assistant'

const baseFacts: AssistantFacts = {
  project: {
    id: 'prj_1',
    code: 'PRJ-2026-001',
    name: 'Demo Project',
    status: 'ACTIVE',
    ragStatus: 'AMBER',
    confidence: 62,
    percentComplete: 45.5,
    percentPlanned: 55.0,
    spi: 0.88,
    cpi: null,
    plannedStart: new Date('2026-01-01'),
    plannedEnd: new Date('2026-06-30'),
    jiraLinked: true,
  },
  activityCount: 12,
  unassignedActivities: 2,
  approvalWaitingCount: 1,
  approvalWaitingDays: 4,
  delayedActivityCount: 3,
  totalSlipDays: 14,
  openRiskCount: 4,
  highRiskCount: 1,
  overdueClientDependencies: 1,
  pendingChangeRequests: 2,
  topDelayReasons: [{ reason: 'Client approval delay', count: 2, daysLost: 10 }],
  delayByPhase: [{ phase: 'Requirements', count: 2, daysLost: 10 }],
  delayByOwner: [{ owner: 'CLIENT', daysLost: 10 }],
  estimateRows: [
    { source: 'PROJECT_ACTIVITY', key: 'a1', title: 'Task A', estimateHours: 8, actualHours: 12, accuracy: 1.5 },
    { source: 'PROJECT_ACTIVITY', key: 'a2', title: 'Task B', estimateHours: 10, actualHours: 9, accuracy: 0.9 },
  ],
  activitiesWithoutEstimate: 3,
}

test('classifyIntent: accepts all allowed intents', () => {
  for (const intent of AI_ASSISTANT_INTENTS) {
    assert.equal(classifyIntent(intent), intent)
  }
})

test('classifyIntent: rejects forbidden intents', () => {
  for (const intent of AI_ASSISTANT_FORBIDDEN_INTENTS) {
    assert.throws(() => classifyIntent(intent), /not allowed/)
  }
})

test('classifyIntent: rejects unknown intents', () => {
  assert.throws(() => classifyIntent('SOME_RANDOM_INTENT'), /not allowed/)
})

test('isAllowedIntent and isForbiddenIntent are mutually exclusive', () => {
  for (const intent of AI_ASSISTANT_INTENTS) {
    assert.equal(isAllowedIntent(intent), true)
    assert.equal(isForbiddenIntent(intent), false)
  }
  for (const intent of AI_ASSISTANT_FORBIDDEN_INTENTS) {
    assert.equal(isAllowedIntent(intent), false)
    assert.equal(isForbiddenIntent(intent), true)
  }
  assert.equal(isAllowedIntent('UNKNOWN'), false)
  assert.equal(isForbiddenIntent('UNKNOWN'), false)
})

test('validateAssistantOutput: accepts capped output', () => {
  const output = ['- One', '- Two', '- Three'].join('\n')
  const result = validateAssistantOutput(output)
  assert.equal(result.valid, true)
  assert.equal(result.bullets, 3)
  assert.equal(result.chars, output.length)
})

test('validateAssistantOutput: rejects too many bullets', () => {
  const output = Array.from({ length: AI_SUMMARY_MAX_BULLETS + 1 }, (_, i) => `- ${i + 1}`).join('\n')
  const result = validateAssistantOutput(output)
  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /5 bullets/)
})

test('validateAssistantOutput: rejects oversized output', () => {
  const output = `- ${'x'.repeat(AI_SUMMARY_MAX_CHARS)}`
  const result = validateAssistantOutput(output)
  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /800 characters/)
})

test('enforceAssistantCaps: trims bullets and characters to hard limits', () => {
  const items = Array.from({ length: 8 }, (_, i) => `- ${i} ${'x'.repeat(250)}`)
  const output = enforceAssistantCaps(items)
  const validation = validateAssistantOutput(output)
  assert.equal(validation.valid, true)
  assert.equal(validation.bullets <= AI_SUMMARY_MAX_BULLETS, true)
  assert.equal(output.length <= AI_SUMMARY_MAX_CHARS, true)
})

test('buildGroundedResponse: executive summary is data-grounded', () => {
  const output = buildGroundedResponse('EXECUTIVE_SUMMARY', baseFacts)
  assert.match(output, /Demo Project/)
  assert.match(output, /AMBER/)
  assert.match(output, /45\.5% complete/)
  assert.equal(validateAssistantOutput(output).valid, true)
})

test('buildGroundedResponse: risk detection reports unassigned and high risks', () => {
  const output = buildGroundedResponse('RISK_DETECTION', baseFacts)
  assert.match(output, /2 active activity\/activities have no assignee/)
  assert.match(output, /1 open risk\(s\) score 15\+/)
  assert.equal(validateAssistantOutput(output).valid, true)
})

test('buildGroundedResponse: delay pattern clusters by phase and owner', () => {
  const output = buildGroundedResponse('DELAY_PATTERN', baseFacts)
  assert.match(output, /Requirements/)
  assert.match(output, /CLIENT/)
  assert.equal(validateAssistantOutput(output).valid, true)
})

test('buildGroundedResponse: estimate suggestion uses historical actuals', () => {
  const output = buildGroundedResponse('ESTIMATE_SUGGESTION', baseFacts)
  assert.match(output, /2 item\(s\)/)
  assert.match(output, /3 activity\/activities currently lack an estimate/)
  assert.equal(validateAssistantOutput(output).valid, true)
})

test('buildGroundedResponse: outputs never exceed configured caps', () => {
  const facts: AssistantFacts = {
    ...baseFacts,
    topDelayReasons: Array.from({ length: 20 }, (_, i) => ({ reason: `Reason ${i}`, count: i, daysLost: i * 100 })),
  }
  for (const intent of AI_ASSISTANT_INTENTS) {
    const output = buildGroundedResponse(intent, facts)
    const validation = validateAssistantOutput(output)
    assert.equal(validation.valid, true, `Intent ${intent} produced invalid output: ${validation.errors.join(', ')}`)
  }
})

test('no auto-send or client-facing path exists in response shape', () => {
  const output = buildGroundedResponse('EXECUTIVE_SUMMARY', baseFacts)
  assert.equal(output.toLowerCase().includes('send'), false)
  assert.equal(output.toLowerCase().includes('client email'), false)
  assert.equal(output.toLowerCase().includes('auto'), false)
})

test('detectForbiddenContext flags requirement and client-send phrases', () => {
  const cases = [
    { text: 'Please write a requirement for the login flow', expected: true },
    { text: 'Generate a spec document', expected: true },
    { text: 'Send this summary to the client via email', expected: true },
    { text: 'Auto send the report', expected: true },
    { text: 'Focus on deployment phase risks', expected: false },
  ]
  for (const { text, expected } of cases) {
    const actual = detectForbiddenContext(text)
    if (actual !== expected) throw new Error(`detectForbiddenContext('${text}') expected ${expected}, got ${actual}`)
  }
})
