/**
 * Zod → react-hook-form resolver. The repo has no @hookform/resolvers
 * dependency (see features/auth/components/SignUpForm.tsx for the same bridge),
 * so the checkpoint and definition forms share this one.
 */
import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { z } from 'zod'

export function zodFormResolver<T extends FieldValues>(schema: z.ZodType): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values)
    if (result.success) return { values, errors: {} }
    const errors: Record<string, { type: string; message: string }> = {}
    for (const issue of result.error.issues) {
      const key = issue.path[0]
      if (key !== undefined && !errors[String(key)]) {
        errors[String(key)] = { type: issue.code, message: issue.message }
      }
    }
    return { values: {}, errors: errors as unknown as FieldErrors<T> }
  }
}
