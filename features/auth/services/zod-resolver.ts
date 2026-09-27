import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { z } from 'zod'

/**
 * Zod → react-hook-form bridge. The repo has no @hookform/resolvers
 * dependency, and one small adapter is cheaper than adding it. Reports the
 * first issue per top-level field, which is all these single-level forms need.
 */
export function zodFormResolver<T extends FieldValues>(schema: z.ZodType): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values)
    if (result.success) return { values, errors: {} }
    const errors: Record<string, { type: string; message: string }> = {}
    for (const issue of result.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !errors[key]) errors[key] = { type: issue.code, message: issue.message }
    }
    return { values: {}, errors: errors as FieldErrors<T> }
  }
}
