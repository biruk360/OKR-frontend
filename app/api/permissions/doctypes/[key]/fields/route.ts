import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest } from '@/lib/api/apiResponse'
import { permissionCache } from '@/lib/permission-cache'
import type { AuthContext } from '@/lib/api/withAuth'

/**
 * PUT /api/permissions/doctypes/[key]/fields
 *
 * Bulk-upserts DocTypeFieldRegistry rows for the given doctype key.
 * Uses the @@unique([doctypeKey, fieldName]) constraint for conflict resolution.
 *
 * Request body:
 * {
 *   fields: Array<{
 *     fieldName: string
 *     displayLabel: string
 *     permLevel: 0 | 1 | 2 | 3
 *     isSensitive: boolean
 *   }>
 * }
 *
 * - Returns 404 if the doctype key does not exist.
 * - Returns 400 if body is malformed or any permLevel is outside [0, 1, 2, 3].
 * - Invalidates the entire permission cache after a successful save.
 * - Restricted to ADMIN role.
 */

const VALID_PERM_LEVELS = new Set([0, 1, 2, 3])

interface FieldInput {
  fieldName: string
  displayLabel: string
  permLevel: number
  isSensitive: boolean
}

type Params = { key: string }

export const PUT = withRole<Params>(['ADMIN'], async (req: NextRequest, { params }: AuthContext<Params>) => {
  const { key } = params

  // Verify the doctype exists before doing any writes.
  const doctype = await prisma.docTypeRegistry.findUnique({
    where: { key },
    select: { key: true },
  })

  if (!doctype) {
    return apiNotFound(`DocType '${key}' not found`)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiBadRequest('Request body must be valid JSON')
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).fields)
  ) {
    return apiBadRequest('Body must be { fields: [...] }')
  }

  const rawFields: unknown[] = (body as { fields: unknown[] }).fields

  // Validate every entry up-front so we don't do a partial write.
  const validatedFields: FieldInput[] = []
  for (let i = 0; i < rawFields.length; i++) {
    const f = rawFields[i] as Record<string, unknown>

    if (typeof f.fieldName !== 'string' || f.fieldName.trim() === '') {
      return apiBadRequest(`fields[${i}].fieldName must be a non-empty string`)
    }
    if (typeof f.displayLabel !== 'string' || f.displayLabel.trim() === '') {
      return apiBadRequest(`fields[${i}].displayLabel must be a non-empty string`)
    }
    const permLevel = typeof f.permLevel === 'number' ? f.permLevel : Number(f.permLevel)
    if (!Number.isInteger(permLevel) || !VALID_PERM_LEVELS.has(permLevel)) {
      return apiBadRequest(
        `fields[${i}].permLevel must be one of 0, 1, 2, 3 — got ${JSON.stringify(f.permLevel)}`
      )
    }

    validatedFields.push({
      fieldName: f.fieldName.trim(),
      displayLabel: f.displayLabel.trim(),
      permLevel,
      isSensitive: Boolean(f.isSensitive),
    })
  }

  // Detect duplicate fieldNames within the request body.
  const seen = new Set<string>()
  for (let i = 0; i < validatedFields.length; i++) {
    const fn = validatedFields[i].fieldName
    if (seen.has(fn)) {
      return apiBadRequest(`Duplicate fieldName '${fn}' at index ${i}`)
    }
    seen.add(fn)
  }

  // Bulk upsert inside a transaction using the @@unique([doctypeKey, fieldName]) key.
  const upserted = await prisma.$transaction(
    validatedFields.map((field) =>
      prisma.docTypeFieldRegistry.upsert({
        where: {
          doctypeKey_fieldName: {
            doctypeKey: key,
            fieldName: field.fieldName,
          },
        },
        create: {
          doctypeKey: key,
          fieldName: field.fieldName,
          displayLabel: field.displayLabel,
          permLevel: field.permLevel,
          isSensitive: field.isSensitive,
        },
        update: {
          displayLabel: field.displayLabel,
          permLevel: field.permLevel,
          isSensitive: field.isSensitive,
        },
      })
    )
  )

  // Invalidate the permission cache so any cached checks reflect the new field config.
  permissionCache.invalidateAll()

  // Also evict the module-local numeric permLevel cache in field-filter.ts (best-effort).
  try {
    const { invalidateAllFieldPermLevelCache } = await import('@/lib/field-filter')
    invalidateAllFieldPermLevelCache()
  } catch {
    // field-filter may not be loaded yet; safe to ignore
  }

  return apiSuccess(
    { upserted },
    { message: `${upserted.length} field(s) saved for DocType '${key}'` }
  )
})
