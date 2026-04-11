/**
 * Next.js 15+ may pass `params` as a Promise in pages, layouts, and route handlers.
 * Next.js 14 passes a plain object. Using `params.id` without awaiting yields `undefined`
 * and Prisma throws → HTTP 500.
 */
export type RouteIdParams = { id: string } | Promise<{ id: string }>

export async function resolveParams<P extends object>(params: P | Promise<P>): Promise<P> {
  return Promise.resolve(params)
}
