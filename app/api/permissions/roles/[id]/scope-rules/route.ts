import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'
import { resolveParams } from '@/lib/resolve-route-params'

type ScopeRuleRouteParams = { id: string } | Promise<{ id: string }>

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
 * GET /api/permissions/roles/[id]/scope-rules
 * Returns all RecordScopeRule rows for the given role.
 */
export const GET = withRole<ScopeRuleRouteParams>(
  ['ADMIN'],
  async (_req: NextRequest, { params }) => {
    const { id } = await resolveParams(params)

    const rules = await prisma.recordScopeRule.findMany({
      where: { targetType: 'role', targetId: id },
      orderBy: { createdAt: 'asc' },
    })

    return apiSuccess(rules)
  }
)

/**
 * POST /api/permissions/roles/[id]/scope-rules
 * Creates a new RecordScopeRule scoped to the given role.
 *
 * Body: { doctypeKey, fieldName, operator, valueType, staticValue? }
 */
export const POST = withRole<ScopeRuleRouteParams>(
  ['ADMIN'],
  async (req: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)

    const body = await req.json()
    const { doctypeKey, fieldName, operator, valueType, staticValue } = body

    // Required field presence
    if (!doctypeKey || typeof doctypeKey !== 'string') {
      return apiBadRequest('doctypeKey is required')
    }
    if (!fieldName || typeof fieldName !== 'string') {
      return apiBadRequest('fieldName is required')
    }
    if (!operator) {
      return apiBadRequest('operator is required')
    }
    if (!valueType) {
      return apiBadRequest('valueType is required')
    }

    // Enum validation
    if (!isValidOperator(operator)) {
      return apiBadRequest(
        `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}`
      )
    }
    if (!isValidValueType(valueType)) {
      return apiBadRequest(
        `Invalid valueType. Must be one of: ${VALID_VALUE_TYPES.join(', ')}`
      )
    }

    // staticValue is required when valueType is 'static'
    if (
      valueType === 'static' &&
      (staticValue === undefined || staticValue === null || staticValue === '')
    ) {
      return apiBadRequest('staticValue is required when valueType is "static"')
    }

    // Verify the doctype exists
    const doctype = await prisma.docTypeRegistry.findUnique({
      where: { key: doctypeKey },
    })
    if (!doctype) {
      return apiNotFound(`DocType "${doctypeKey}" not found in registry`)
    }

    const rule = await prisma.recordScopeRule.create({
      data: {
        targetType: 'role',
        targetId: id,
        doctypeKey,
        fieldName,
        operator,
        valueType,
        staticValue: staticValue ?? null,
        isActive: true,
        createdById: session.user.id,
      },
    })

    return apiSuccess(rule, { status: 201, message: 'Scope rule created successfully.' })
  }
)
