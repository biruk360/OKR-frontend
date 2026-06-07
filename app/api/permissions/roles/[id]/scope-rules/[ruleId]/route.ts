import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'
import { resolveParams } from '@/lib/resolve-route-params'

type ScopeRuleItemParams =
  | { id: string; ruleId: string }
  | Promise<{ id: string; ruleId: string }>

const VALID_OPERATORS = ['equals', 'in', 'is_child_of', 'is_owner'] as const
const VALID_VALUE_TYPES = [
  'static',
  'user_department',
  'user_id',
  'user_team',
  'user_primary_dept',
] as const

type Operator = (typeof VALID_OPERATORS)[number]
type ValueType = (typeof VALID_VALUE_TYPES)[number]

function isValidOperator(value: unknown): value is Operator {
  return VALID_OPERATORS.includes(value as Operator)
}

function isValidValueType(value: unknown): value is ValueType {
  return VALID_VALUE_TYPES.includes(value as ValueType)
}

/**
 * PUT /api/permissions/roles/[id]/scope-rules/[ruleId]
 * Updates an existing RecordScopeRule that belongs to the given role.
 *
 * Body (all optional): { fieldName?, operator?, valueType?, staticValue?, isActive? }
 */
export const PUT = withRole<ScopeRuleItemParams>(
  ['ADMIN'],
  async (req: NextRequest, { params }) => {
    const { id, ruleId } = await resolveParams(params)

    // Verify the rule belongs to this role
    const existing = await prisma.recordScopeRule.findFirst({
      where: { id: ruleId, targetType: 'role', targetId: id },
    })
    if (!existing) {
      return apiNotFound('Scope rule not found for this role')
    }

    const body = await req.json()
    const { fieldName, operator, valueType, staticValue, isActive } = body

    // Validate optional enum fields when supplied
    if (operator !== undefined && !isValidOperator(operator)) {
      return apiBadRequest(
        `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}`
      )
    }
    if (valueType !== undefined && !isValidValueType(valueType)) {
      return apiBadRequest(
        `Invalid valueType. Must be one of: ${VALID_VALUE_TYPES.join(', ')}`
      )
    }

    // Resolve effective valueType (after possible update) to validate staticValue constraint
    const effectiveValueType = valueType ?? existing.valueType
    const effectiveStaticValue =
      staticValue !== undefined ? staticValue : existing.staticValue

    if (
      effectiveValueType === 'static' &&
      (effectiveStaticValue === undefined ||
        effectiveStaticValue === null ||
        effectiveStaticValue === '')
    ) {
      return apiBadRequest('staticValue is required when valueType is "static"')
    }

    // Build the update payload from only the fields provided
    const data: Record<string, unknown> = {}
    if (fieldName !== undefined) data.fieldName = fieldName
    if (operator !== undefined) data.operator = operator
    if (valueType !== undefined) data.valueType = valueType
    if (staticValue !== undefined) data.staticValue = staticValue
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return apiBadRequest('isActive must be a boolean')
      }
      data.isActive = isActive
    }

    if (Object.keys(data).length === 0) {
      return apiBadRequest('No fields provided to update')
    }

    const updated = await prisma.recordScopeRule.update({
      where: { id: ruleId },
      data,
    })

    return apiSuccess(updated, { message: 'Scope rule updated successfully.' })
  }
)

/**
 * DELETE /api/permissions/roles/[id]/scope-rules/[ruleId]
 * Deletes a RecordScopeRule, verifying it belongs to the given role first.
 */
export const DELETE = withRole<ScopeRuleItemParams>(
  ['ADMIN'],
  async (_req: NextRequest, { params }) => {
    const { id, ruleId } = await resolveParams(params)

    // Verify the rule belongs to this role before deleting
    const existing = await prisma.recordScopeRule.findFirst({
      where: { id: ruleId, targetType: 'role', targetId: id },
    })
    if (!existing) {
      return apiNotFound('Scope rule not found for this role')
    }

    await prisma.recordScopeRule.delete({ where: { id: ruleId } })

    return apiSuccess(
      { id: ruleId },
      { message: 'Scope rule deleted successfully.' }
    )
  }
)
