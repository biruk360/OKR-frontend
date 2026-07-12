import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { isPerformanceAdmin, resolveRecommendationRules } from '@/lib/performance'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'

/**
 * Performance module settings (singleton PerformanceSettings row).
 * GET returns the row (created with defaults on first access); PATCH updates
 * the five configurable fields. Admin-only in both directions.
 */

async function getSettings() {
  return prisma.performanceSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  })
}

export const GET = withAuth(async (_request, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await isPerformanceAdmin(actor)) return apiForbidden('You do not have permission to view performance settings')
  const settings = await getSettings()
  return apiSuccess({ ...settings, recommendationRules: resolveRecommendationRules(settings.recommendationRulesJson) })
})

const RULE_BOOLEAN_KEYS = [
  'readyPromotionRequiresImprovingTrend',
  'readySalaryAdjustment',
  'readyTopTierBonus',
  'onTrackBonus',
] as const

export const PATCH = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await isPerformanceAdmin(actor)) return apiForbidden('You do not have permission to update performance settings')

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return apiBadRequest('A JSON body is required')

  const data: Prisma.PerformanceSettingsUpdateInput = {}

  if (body.varianceThreshold !== undefined) {
    const value = body.varianceThreshold
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return apiBadRequest('varianceThreshold must be a number greater than 0')
    }
    data.varianceThreshold = value
  }
  if (body.improvementFocusLimit !== undefined) {
    const value = body.improvementFocusLimit
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
      return apiBadRequest('improvementFocusLimit must be an integer between 1 and 5')
    }
    data.improvementFocusLimit = value
  }
  if (body.remarkAttributionEnabled !== undefined) {
    if (typeof body.remarkAttributionEnabled !== 'boolean') {
      return apiBadRequest('remarkAttributionEnabled must be a boolean')
    }
    data.remarkAttributionEnabled = body.remarkAttributionEnabled
  }
  if (body.weeklyNudgeDay !== undefined) {
    const value = body.weeklyNudgeDay
    // ISO weekday per the schema (Monday = 1 ... Sunday = 7).
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 7) {
      return apiBadRequest('weeklyNudgeDay must be an ISO weekday integer between 1 (Monday) and 7 (Sunday)')
    }
    data.weeklyNudgeDay = value
  }
  if (body.recommendationRulesJson !== undefined) {
    const rules = body.recommendationRulesJson
    if (rules === null) {
      data.recommendationRulesJson = Prisma.DbNull
    } else {
      if (typeof rules !== 'object' || Array.isArray(rules)) {
        return apiBadRequest('recommendationRulesJson must be an object or null')
      }
      const source = rules as Record<string, unknown>
      for (const key of RULE_BOOLEAN_KEYS) {
        if (source[key] !== undefined && typeof source[key] !== 'boolean') {
          return apiBadRequest(`recommendationRulesJson.${key} must be a boolean`)
        }
      }
      const threshold = source.criterionTrainingThreshold
      if (threshold !== undefined
        && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 5)) {
        return apiBadRequest('recommendationRulesJson.criterionTrainingThreshold must be a number between 0 and 5')
      }
      const unknownKeys = Object.keys(source).filter(
        (key) => !(RULE_BOOLEAN_KEYS as readonly string[]).includes(key) && key !== 'criterionTrainingThreshold',
      )
      if (unknownKeys.length > 0) {
        return apiBadRequest(`recommendationRulesJson contains unknown keys: ${unknownKeys.join(', ')}`)
      }
      data.recommendationRulesJson = source as Prisma.InputJsonValue
    }
  }

  if (Object.keys(data).length === 0) return apiBadRequest('No valid settings fields were provided')

  const before = await getSettings()
  const updated = await prisma.performanceSettings.update({ where: { id: 'singleton' }, data })

  const changes: ChangeMap = {}
  for (const key of ['varianceThreshold', 'improvementFocusLimit', 'remarkAttributionEnabled', 'weeklyNudgeDay', 'recommendationRulesJson'] as const) {
    const from = before[key]
    const to = updated[key]
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) changes[key] = { from, to }
  }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'PERFORMANCE_SETTINGS',
      action: 'SETTINGS_UPDATED',
      actorId: session.user.id,
      changes,
    })
  }

  return apiSuccess({ ...updated, recommendationRules: resolveRecommendationRules(updated.recommendationRulesJson) })
})
