/**
 * Performance benchmark for the permission cache and resolver.
 *
 * Usage:
 *   npx tsx scripts/benchmark-permissions.ts
 *   # or
 *   npx ts-node scripts/benchmark-permissions.ts
 *
 * Targets:
 *   - Cache MISS (DB query)      : ≤10 ms
 *   - Cache HIT  (avg of 99 runs): ≤1 ms
 *   - permissionCache.get() only : ≤0.1 ms
 */

import { prisma } from '../lib/prisma'
import { resolveDocTypePermission } from '../lib/permission-resolver'
import { permissionCache } from '../lib/permission-cache'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ITERATIONS = 100
const DOCTYPE    = 'objective'
const ACTION     = 'read' as const

/** Microseconds → milliseconds, rounded to 4 decimal places. */
function us2ms(us: number): string {
  return (us / 1000).toFixed(4)
}

/** Simple pass/fail label. */
function verdict(pass: boolean): string {
  return pass ? 'PASS ✅' : 'FAIL ❌'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the first user that has an active UserRole in the DB.
 * Falls back to a hardcoded stub so the benchmark is always runnable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

async function findTestUserId(): Promise<string> {
  try {
    const userRole = await db.userRole.findFirst({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: { userId: true },
    })
    if (userRole?.userId) {
      return userRole.userId as string
    }
  } catch {
    // Model may not exist yet — handled below.
  }

  // Fallback: grab any user from the legacy User table.
  try {
    const user = await prisma.user.findFirst({ select: { id: true } })
    if (user?.id) return user.id
  } catch {
    // No user table either.
  }

  // Ultimate fallback — a synthetic ID that will simply resolve to false.
  return 'benchmark-synthetic-user-id'
}

// ---------------------------------------------------------------------------
// Benchmark sections
// ---------------------------------------------------------------------------

/**
 * Section 1: resolveDocTypePermission — cold cache (cache MISS) + warm cache (cache HIT).
 * Runs ITERATIONS total calls; first is cold, remaining ITERATIONS-1 are warm.
 */
async function benchmarkResolver(userId: string): Promise<{
  missDurationMs: string
  hitAvgMs: string
  missPass: boolean
  hitPass: boolean
}> {
  // Ensure the cache is cold for this user/doctype/action before we start.
  permissionCache.invalidateUser(userId)

  const timings: number[] = []

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = process.hrtime()
    await resolveDocTypePermission(userId, DOCTYPE, ACTION)
    const t1 = process.hrtime(t0)
    timings.push(t1[0] * 1_000_000 + t1[1] / 1000) // microseconds
  }

  const missDuration = timings[0]
  const hitTimings   = timings.slice(1) // ITERATIONS-1 warm runs
  const hitTotal     = hitTimings.reduce((acc, v) => acc + v, 0)
  const hitAvg       = hitTotal / hitTimings.length

  const missDurationMs = us2ms(missDuration)
  const hitAvgMs       = us2ms(hitAvg)

  const missPass = missDuration / 1000 <= 10
  const hitPass  = hitAvg / 1000 <= 1

  return { missDurationMs, hitAvgMs, missPass, hitPass }
}

/**
 * Section 2: permissionCache.get() only — pure in-memory Map lookup.
 * Pre-seeds a key so every call is a guaranteed cache hit.
 */
async function benchmarkCacheGet(userId: string): Promise<{
  avgMs: string
  pass: boolean
}> {
  const CACHE_ITERATIONS = 10_000 // more iterations for a sub-millisecond operation
  const key = `perm:${userId}:${DOCTYPE}:${ACTION}`

  // Seed the cache entry.
  permissionCache.set(key, true)

  const t0 = process.hrtime()
  for (let i = 0; i < CACHE_ITERATIONS; i++) {
    permissionCache.get(key)
  }
  const t1 = process.hrtime(t0)

  const totalUs = t1[0] * 1_000_000 + t1[1] / 1000 // microseconds
  const avgUs   = totalUs / CACHE_ITERATIONS
  const avgMs   = us2ms(avgUs)
  const pass    = avgUs / 1000 <= 0.1

  return { avgMs, pass }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('  Permission Cache & Resolver — Performance Benchmark')
  console.log('='.repeat(60))
  console.log()

  // ------------------------------------------------------------------
  // DB connectivity check
  // ------------------------------------------------------------------
  let userId: string
  try {
    await prisma.$connect()
    userId = await findTestUserId()
    console.log(`Using test userId : ${userId}`)
    console.log()
  } catch (err) {
    console.error('DB is unreachable — skipping benchmark (optional).')
    console.error((err as Error).message)
    process.exit(0)
  }

  // ------------------------------------------------------------------
  // Section 1: resolveDocTypePermission
  // ------------------------------------------------------------------
  console.log(`[Section 1] resolveDocTypePermission("${DOCTYPE}", "${ACTION}")`)
  console.log(`  Iterations : ${ITERATIONS} (1 cold + ${ITERATIONS - 1} warm)`)
  console.log()

  let resolverResult: Awaited<ReturnType<typeof benchmarkResolver>>
  try {
    resolverResult = await benchmarkResolver(userId)
  } catch (err) {
    console.error('Resolver benchmark failed:', (err as Error).message)
    process.exit(1)
  }

  const { missDurationMs, hitAvgMs, missPass, hitPass } = resolverResult

  console.log(`  Cache MISS  : ${missDurationMs} ms  (target ≤10 ms)  — ${verdict(missPass)}`)
  console.log(`  Cache HIT   : ${hitAvgMs} ms  (target ≤1 ms)   — ${verdict(hitPass)}`)
  console.log()

  // ------------------------------------------------------------------
  // Section 2: permissionCache.get() — pure cache lookup
  // ------------------------------------------------------------------
  console.log('[Section 2] permissionCache.get()  (pure in-memory lookup)')
  console.log('  Iterations : 10,000')
  console.log()

  let cacheResult: Awaited<ReturnType<typeof benchmarkCacheGet>>
  try {
    cacheResult = await benchmarkCacheGet(userId)
  } catch (err) {
    console.error('Cache benchmark failed:', (err as Error).message)
    process.exit(1)
  }

  const { avgMs: cacheAvgMs, pass: cachePass } = cacheResult

  console.log(`  Avg per get : ${cacheAvgMs} ms  (target ≤0.1 ms)  — ${verdict(cachePass)}`)
  console.log()

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log('='.repeat(60))
  console.log('  Summary')
  console.log('='.repeat(60))
  const allPass = missPass && hitPass && cachePass
  console.log(`  Cache MISS  (≤10 ms)    : ${missDurationMs} ms  ${verdict(missPass)}`)
  console.log(`  Cache HIT   (≤1 ms)     : ${hitAvgMs} ms  ${verdict(hitPass)}`)
  console.log(`  Cache.get() (≤0.1 ms)   : ${cacheAvgMs} ms  ${verdict(cachePass)}`)
  console.log()
  console.log(`  Overall: ${allPass ? 'ALL TARGETS MET ✅' : 'SOME TARGETS MISSED ❌'}`)
  console.log('='.repeat(60))
  console.log()

  await prisma.$disconnect()
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
