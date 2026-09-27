/**
 * Run work after the HTTP response has been sent.
 *
 * Notification fan-out (recipient resolution, one `notification.create` and a
 * Pusher round-trip per recipient, IMMEDIATE SMTP sends) used to run inline in
 * mutation routes, so the author of a comment waited on every recipient's
 * email before seeing their own comment. The mutation and its audit row are
 * what the caller needs; notifications are not.
 *
 * Production is a long-lived Node process (PM2), so a detached promise runs to
 * completion. Next 14 has no `after()`; when the app moves to a version that
 * does, or to a serverless host that freezes after the response, this is the
 * one place to change. Spec: docs/card_comments_links_board_filter_REQUIREMENTS.md CPF-7.
 *
 * Outside a request (cron route, the automations worker, a `tsx` script) this
 * is plain fire-and-forget on the same event loop: the work still runs, and
 * errors are still caught and logged. A short-lived script that calls
 * `process.exit()` would cut it off, so such scripts must either await the
 * synchronous variant of whatever they call (`emitNow`, `writeDirectNotificationsNow`)
 * or `await flushBackgroundWork()` before exiting.
 *
 * Never throws and never rejects — a failure is logged under `label`.
 */

/** Hands a job to the event loop. Swappable in tests (see setBackgroundScheduler). */
export type BackgroundScheduler = (run: () => void) => void

const defaultScheduler: BackgroundScheduler = (run) => {
  // setImmediate, not a bare call: the work's synchronous prefix must not run
  // before the route returns its response.
  setImmediate(run)
}

let scheduler: BackgroundScheduler = defaultScheduler

/** Every job that has been scheduled and has not yet settled. */
const pending = new Set<Promise<void>>()

export function runAfterResponse(label: string, work: () => Promise<unknown>): void {
  let settle!: () => void
  const tracked = new Promise<void>((resolve) => { settle = resolve })
  pending.add(tracked)

  const run = () => {
    // Promise.resolve().then(work): a `work` that throws synchronously becomes
    // a rejection we catch, rather than an exception escaping into the timer.
    Promise.resolve()
      .then(work)
      .catch((err) => {
        console.error(`[background:${label}]`, err)
      })
      .finally(() => {
        pending.delete(tracked)
        settle()
      })
  }

  try {
    scheduler(run)
  } catch (err) {
    // A broken scheduler must not strand the job or throw into the route.
    console.error(`[background:${label}] scheduler failed; running inline`, err)
    run()
  }
}

/** Number of scheduled jobs that have not settled yet. */
export function pendingBackgroundWork(): number {
  return pending.size
}

/**
 * Wait until every scheduled job (including jobs scheduled by jobs) has
 * settled, or `timeoutMs` passes. For scripts and workers about to exit, and
 * for tests. Never rejects.
 */
export async function flushBackgroundWork(timeoutMs = 30_000): Promise<{ drained: boolean; pending: number }> {
  const deadline = Date.now() + timeoutMs
  while (pending.size > 0) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.all(Array.from(pending)),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, remaining) }),
    ])
    if (timer) clearTimeout(timer)
  }
  return { drained: pending.size === 0, pending: pending.size }
}

/**
 * Test seam: replace how jobs are handed to the event loop. Pass `null` to
 * restore the default. Returns a function that restores the previous scheduler.
 */
export function setBackgroundScheduler(next: BackgroundScheduler | null): () => void {
  const previous = scheduler
  scheduler = next ?? defaultScheduler
  return () => { scheduler = previous }
}
