/**
 * LPV-8 — in-process LRU with per-entry TTL and in-flight request coalescing.
 *
 * Production is a long-lived Node process (PM2), so a module-level instance
 * lives for the life of the server. Pure — no Node imports.
 */

export const LINK_PREVIEW_CACHE_MAX = 500
export const LINK_PREVIEW_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000
export const LINK_PREVIEW_FAILURE_TTL_MS = 10 * 60 * 1000

interface Entry<V> {
  value: V
  expiresAt: number
}

export class TtlLruCache<V> {
  private readonly entries = new Map<string, Entry<V>>()
  private readonly inflight = new Map<string, Promise<V>>()

  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size
  }

  get(key: string): V | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    // Refresh recency: Map iteration order is insertion order.
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit.value
  }

  set(key: string, value: V, ttlMs: number): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs })
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  clear(): void {
    this.entries.clear()
    this.inflight.clear()
  }

  /**
   * Return the cached value, or run `load` once — concurrent callers for the
   * same key share one promise. `ttlFor` picks the TTL from the loaded value
   * (e.g. shorter for failures). A rejected load is not cached.
   */
  getOrLoad(key: string, load: () => Promise<V>, ttlFor: (value: V) => number): Promise<V> {
    const cached = this.get(key)
    if (cached !== undefined) return Promise.resolve(cached)
    const running = this.inflight.get(key)
    if (running) return running
    const promise = load().then(
      (value) => {
        this.inflight.delete(key)
        this.set(key, value, ttlFor(value))
        return value
      },
      (error: unknown) => {
        this.inflight.delete(key)
        throw error
      },
    )
    this.inflight.set(key, promise)
    return promise
  }
}
