import { z } from 'zod'
import {
  SCRUM_ABSENCE_TYPES,
  SCRUM_BLOCKER_CATEGORIES,
  SCRUM_LINK_CONTEXTS,
  SCRUM_MOODS,
  SCRUM_PROXY_REASONS,
} from '@/types/scrum'
import { scrumLinkInputSchema } from './scrum-links'

const richText = z.string().trim().min(10).max(10000)
const optionalRichText = z.string().trim().max(10000).optional().nullable()

const scrumItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(1000),
  todoId: z.string().min(1).optional(),
  objectiveId: z.string().min(1).optional(),
  keyResultId: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'DONE', 'CARRIED', 'NOT_DONE']).optional(),
})

const scrumContentJsonSchema = z.object({
  yesterdayItems: z.array(scrumItemSchema).max(100).optional(),
  todayItems: z.array(scrumItemSchema).max(100).optional(),
  blockerItems: z.array(scrumItemSchema).max(100).optional(),
  winItems: z.array(scrumItemSchema).max(100).optional(),
})

const scrumUpdateInputBaseSchema = z.object({
  userId: z.string().min(1).optional(),
  scrumDate: z.string().date().optional(),
  yesterdayDone: richText.optional().nullable(),
  yesterdayStatusJson: z.unknown().optional().nullable(),
  todayPlan: richText.optional().nullable(),
  blockers: optionalRichText,
  blockerCategory: z.enum(SCRUM_BLOCKER_CATEGORIES).optional().nullable(),
  wins: optionalRichText,
  mood: z.enum(SCRUM_MOODS).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  projectActivityId: z.string().min(1).optional().nullable(),
  proxyReason: z.enum(SCRUM_PROXY_REASONS).optional().nullable(),
  proxyReasonDetail: z.string().trim().max(500).optional().nullable(),
  links: z.array(scrumLinkInputSchema).max(30).optional(),
  contentJson: scrumContentJsonSchema.optional().nullable(),
  remarks: z.string().trim().max(20000).optional().nullable(),
})

function hasBlockerItems(value: any) {
  const items = value.contentJson?.blockerItems
  return Array.isArray(items) && items.length > 0
}

export const scrumUpdateInputSchema = scrumUpdateInputBaseSchema.refine((value) => !hasBlockerItems(value) || !!value.blockerCategory, {
  path: ['blockerCategory'],
  message: 'Blocker category is required when blockers are present',
})

export const scrumUpdatePatchSchema = scrumUpdateInputBaseSchema.partial().refine((value) => !hasBlockerItems(value) || !!value.blockerCategory, {
  path: ['blockerCategory'],
  message: 'Blocker category is required when blockers are present',
})

export const scrumCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  mentions: z.array(z.string().min(1)).max(50).optional(),
})

export const blockerResolveSchema = z.object({
  resolutionNote: z.string().trim().min(5).max(2000),
})

export const blockerEscalateSchema = z.object({
  escalatedToUserId: z.string().min(1).optional().nullable(),
})

export const absenceSchema = z.object({
  userId: z.string().min(1),
  from: z.string().date(),
  to: z.string().date().optional(),
  type: z.enum(SCRUM_ABSENCE_TYPES),
  reason: z.string().trim().max(1000).optional().nullable(),
})

export const settingsPatchSchema = z.object({
  timezone: z.string().min(1).optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  cutoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  absentTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  managerDigestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  nudgeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weeklyDigestDay: z.number().int().min(1).max(7).optional(),
  weeklyDigestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  holidays: z.array(z.string().date()).optional(),
  moodEnabled: z.boolean().optional(),
  winsEnabled: z.boolean().optional(),
  proxyEntryEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  requireTodoLink: z.boolean().optional(),
  recurringThresholdDays: z.number().int().min(1).max(30).optional(),
  escalationThresholdDays: z.number().int().min(1).max(60).optional(),
  moodAlertDays: z.number().int().min(1).max(60).optional(),
  objectiveNeglectDays: z.number().int().min(1).max(120).optional(),
})

export const savedViewSchema = z.object({
  name: z.string().trim().min(2).max(80),
  filtersJson: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
})

export const linkCreateSchema = z.object({
  updateId: z.string().min(1),
  objectiveId: z.string().min(1).optional().nullable(),
  keyResultId: z.string().min(1).optional().nullable(),
  todoId: z.string().min(1).optional().nullable(),
  context: z.enum(SCRUM_LINK_CONTEXTS),
  progressNote: z.string().trim().max(120).optional().nullable(),
}).refine((value) => [value.objectiveId, value.keyResultId, value.todoId].filter(Boolean).length === 1, {
  message: 'Exactly one linked entity is required',
})
