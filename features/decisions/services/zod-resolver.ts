/**
 * Zod → react-hook-form bridge (the repo has no @hookform/resolvers). Handles
 * nested paths. Pure and client-safe.
 */
import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { z } from 'zod'

export function zodFormResolver<T extends FieldValues>(schema: z.ZodType<T>): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values)
    if (result.success) return { values: result.data, errors: {} }
    const errors: Record<string, unknown> = {}
    for (const issue of result.error.issues) {
      let node = errors
      const path = issue.path.map(String)
      if (path.length === 0) path.push('root')
      path.forEach((key, index) => {
        if (index === path.length - 1) {
          if (!node[key]) node[key] = { type: issue.code, message: issue.message }
        } else {
          const nextIsIndex = /^\d+$/.test(path[index + 1] ?? '')
          node[key] = (node[key] as Record<string, unknown>) ?? (nextIsIndex ? [] : {})
          node = node[key] as Record<string, unknown>
        }
      })
    }
    return { values: {}, errors: errors as FieldErrors<T> }
  }
}
