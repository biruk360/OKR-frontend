/**
 * Non-blocking notification fan-out — the scheduling half of `emit()`.
 *
 * `emit()` used to do everything inside the caller's request: resolve
 * recipients, then for each one sequentially insert a Notification row, make a
 * Pusher HTTP call and (IMMEDIATE cadence) an SMTP send. A to-do PATCH that
 * emits four events waited on all of it.
 *
 * The split:
 *   plan    — awaited by the caller. Validates the event and resolves anything
 *             that reads entity state the caller just changed (recipients,
 *             redaction scope), and snapshots the payload.
 *   deliver — scheduled with runAfterResponse. Preferences, Notification rows,
 *             Pusher, email / digest queue. Errors are logged, never thrown.
 *
 * `now` mode awaits delivery too (cron jobs, scripts, anything whose next step
 * depends on the rows existing). Both modes share one process-wide limiter so a
 * cron burst cannot open more concurrent deliveries than the Prisma pool can
 * serve, and deliveries for the same key (event + entity) run in order so the
 * digest-queue dedupe (read-then-insert) cannot race with itself.
 *
 * No Prisma / server imports here: this module is unit-tested in isolation.
 */

import { runAfterResponse } from '@/lib/background'

export type DeliveryMode = 'deferred' | 'now'

/** Max emits delivering at once, process-wide. */
export const DELIVERY_CONCURRENCY = 2
/** Max recipients a single delivery works on at once. */
export const RECIPIENT_CONCURRENCY = 5

/** A promise-returning task gate that runs at most `max` tasks at once. */
export function createLimiter(max: number) {
  if (!Number.isInteger(max) || max < 1) throw new Error(`createLimiter: max must be a positive integer, got ${max}`)
  let active = 0
  const waiting: Array<() => void> = []
  const release = () => {
    active--
    const next = waiting.shift()
    if (next) { active++; next() }
  }
  const limit = <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        Promise.resolve().then(task).then(resolve, reject).finally(release)
      }
      if (active < max) { active++; start() } else { waiting.push(start) }
    })
  return Object.assign(limit, {
    get active() { return active },
    get waiting() { return waiting.length },
  })
}

/**
 * Run `fn` over `items` with at most `limit` in flight. Every item is
 * attempted; the result is settled per item so one recipient failing never
 * skips the rest.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  await Promise.all(workers)
  return results
}

/** Serialises tasks that share a key; tasks with different keys are independent. */
export function createKeyedSerializer() {
  const tails = new Map<string, Promise<unknown>>()
  return function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve()
    const run = prev.then(task, task)
    const tail = run.catch(() => undefined)
    tails.set(key, tail)
    // Drop the entry once nothing newer has chained on, so the map stays small.
    void tail.then(() => { if (tails.get(key) === tail) tails.delete(key) })
    return run
  }
}

export interface Emitter<A extends unknown[]> {
  /** Plan now, deliver after the response. Never throws. */
  emit: (...args: A) => Promise<void>
  /** Plan and deliver before resolving. Never throws. */
  emitNow: (...args: A) => Promise<void>
}

export interface EmitterDeps<A extends unknown[], P> {
  /** Label for logs, e.g. 'notifications'. */
  name: string
  /** Awaited by the caller. Return null when there is nothing to deliver. */
  plan: (...args: A) => Promise<P | null>
  deliver: (plan: P) => Promise<void>
  /** Deliveries sharing a key run strictly in order. */
  keyOf?: (plan: P) => string
  /** Human label for a plan, used in error logs. */
  labelOf?: (plan: P) => string
  /** Defaults to a process-wide limiter shared by every emitter. */
  limiter?: <T>(task: () => Promise<T>) => Promise<T>
  /** Defaults to runAfterResponse. Tests pass a fake. */
  schedule?: (label: string, work: () => Promise<unknown>) => void
  log?: (...args: unknown[]) => void
}

const sharedLimiter = createLimiter(DELIVERY_CONCURRENCY)
const sharedSerializer = createKeyedSerializer()

export function createEmitter<A extends unknown[], P>(deps: EmitterDeps<A, P>): Emitter<A> {
  const limiter = deps.limiter ?? sharedLimiter
  const schedule = deps.schedule ?? runAfterResponse
  const log = deps.log ?? ((...args: unknown[]) => console.error(...args))
  const serialize = deps.limiter ? createKeyedSerializer() : sharedSerializer

  const runDelivery = (p: P): Promise<void> => {
    const task = () => limiter(() => deps.deliver(p))
    return deps.keyOf ? serialize(`${deps.name}:${deps.keyOf(p)}`, task) : task()
  }
  const label = (p: P) => deps.labelOf?.(p) ?? deps.name

  const run = async (mode: DeliveryMode, args: A): Promise<void> => {
    let p: P | null
    try {
      p = await deps.plan(...args)
    } catch (err) {
      log(`[${deps.name}] plan failed`, err)
      return
    }
    if (p === null) return
    const planned = p
    if (mode === 'now') {
      try {
        await runDelivery(planned)
      } catch (err) {
        log(`[${deps.name}] delivery failed`, label(planned), err)
      }
      return
    }
    try {
      schedule(`${deps.name}:${label(planned)}`, () =>
        runDelivery(planned).catch((err) => {
          log(`[${deps.name}] delivery failed`, label(planned), err)
        }),
      )
    } catch (err) {
      log(`[${deps.name}] could not schedule delivery`, label(planned), err)
    }
  }

  return {
    emit: (...args: A) => run('deferred', args),
    emitNow: (...args: A) => run('now', args),
  }
}

/**
 * The delivery half on its own, for writers whose planning is already done
 * (writeDirectNotifications). Shares the process-wide limiter. Never throws.
 */
export async function dispatchDelivery(
  label: string,
  mode: DeliveryMode,
  work: () => Promise<unknown>,
  opts: { schedule?: EmitterDeps<[], unknown>['schedule']; log?: (...args: unknown[]) => void } = {},
): Promise<void> {
  const log = opts.log ?? ((...args: unknown[]) => console.error(...args))
  if (mode === 'now') {
    try {
      await sharedLimiter(work)
    } catch (err) {
      log(`[${label}] delivery failed`, err)
    }
    return
  }
  try {
    ;(opts.schedule ?? runAfterResponse)(label, () =>
      sharedLimiter(work).catch((err) => { log(`[${label}] delivery failed`, err) }),
    )
  } catch (err) {
    log(`[${label}] could not schedule delivery`, err)
  }
}
