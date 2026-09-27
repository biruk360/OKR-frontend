import { prisma } from '@/lib/prisma'

/**
 * Retention sweep for append-only tables that nothing else prunes.
 *
 * Called nightly by /api/cron/prune-notifications (scripts/install-crontab.sh).
 * Each table is pruned independently — one failing table is logged and reported
 * but does not stop the others — and in bounded batches (select ids, then
 * delete by id), so a first run against a table that has grown for months does
 * not hold one enormous DELETE's locks or blow the statement timeout.
 *
 * Retention defaults (days) and the env var that overrides each:
 *
 *   EmailDigestQueue  30   RETENTION_EMAIL_DIGEST_DAYS      — SENT rows only; unsent rows are
 *                                                          still owed to someone and are kept.
 *   OutboundEmail     90   RETENTION_OUTBOUND_EMAIL_DAYS    — the delivery log (bodies include
 *                                                          one-time links; no reason to keep them).
 *   ClientErrorLog    30   RETENTION_CLIENT_ERROR_DAYS
 *   TelegramMessage  180   TELEGRAM_MESSAGE_RETENTION_DAYS  — scraped chat history used by /ask.
 *   AiGenerationLog  180   RETENTION_AI_GENERATION_DAYS     — cost/audit rows; responseJson is large.
 *   JiraSyncLog       30   RETENTION_JIRA_SYNC_LOG_DAYS     — one row per connection per 30-min sync.
 *
 * An override below MIN_RETENTION_DAYS is ignored (falls back to the default)
 * so a typo cannot wipe a table.
 */

export const MIN_RETENTION_DAYS = 7
const BATCH_SIZE = 2000
/** Upper bound on batches per table per run — 100 × 2000 = 200k rows. The rest waits for tomorrow. */
const MAX_BATCHES = 100
const DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionRule {
  table: string
  defaultDays: number
  envVar: string
}

export const RETENTION_RULES = {
  emailDigestQueue: { table: 'EmailDigestQueue', defaultDays: 30, envVar: 'RETENTION_EMAIL_DIGEST_DAYS' },
  outboundEmail: { table: 'OutboundEmail', defaultDays: 90, envVar: 'RETENTION_OUTBOUND_EMAIL_DAYS' },
  clientErrorLog: { table: 'ClientErrorLog', defaultDays: 30, envVar: 'RETENTION_CLIENT_ERROR_DAYS' },
  telegramMessage: { table: 'TelegramMessage', defaultDays: 180, envVar: 'TELEGRAM_MESSAGE_RETENTION_DAYS' },
  aiGenerationLog: { table: 'AiGenerationLog', defaultDays: 180, envVar: 'RETENTION_AI_GENERATION_DAYS' },
  jiraSyncLog: { table: 'JiraSyncLog', defaultDays: 30, envVar: 'RETENTION_JIRA_SYNC_LOG_DAYS' },
} satisfies Record<string, RetentionRule>

export type RetentionKey = keyof typeof RETENTION_RULES

export function retentionDays(rule: RetentionRule, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[rule.envVar]
  if (!raw) return rule.defaultDays
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < MIN_RETENTION_DAYS) return rule.defaultDays
  return parsed
}

export function cutoffFor(rule: RetentionRule, now = new Date(), env: NodeJS.ProcessEnv = process.env): Date {
  return new Date(now.getTime() - retentionDays(rule, env) * DAY_MS)
}

/**
 * Delete in batches: `findIds` returns up to `take` ids that are due, `deleteIds`
 * removes them. Stops when a batch comes back short or MAX_BATCHES is reached.
 */
async function deleteInBatches(
  findIds: (take: number) => Promise<{ id: string }[]>,
  deleteIds: (ids: string[]) => Promise<{ count: number }>,
): Promise<{ deleted: number; capped: boolean }> {
  let deleted = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await findIds(BATCH_SIZE)
    if (rows.length === 0) return { deleted, capped: false }
    const result = await deleteIds(rows.map((r) => r.id))
    deleted += result.count
    if (rows.length < BATCH_SIZE) return { deleted, capped: false }
  }
  return { deleted, capped: true }
}

export interface TablePruneResult {
  table: string
  retentionDays: number
  deleted: number
  /** True when MAX_BATCHES was hit — more rows are due and will go on the next run. */
  capped: boolean
  error?: string
}

export async function pruneRetainedTables(now = new Date()): Promise<TablePruneResult[]> {
  const R = RETENTION_RULES
  const jobs: Array<{ rule: RetentionRule; run: (cutoff: Date) => Promise<{ deleted: number; capped: boolean }> }> = [
    {
      rule: R.emailDigestQueue,
      run: (cutoff) => deleteInBatches(
        (take) => prisma.emailDigestQueue.findMany({ where: { sentAt: { not: null, lt: cutoff } }, select: { id: true }, take }),
        (ids) => prisma.emailDigestQueue.deleteMany({ where: { id: { in: ids } } }),
      ),
    },
    {
      rule: R.outboundEmail,
      run: (cutoff) => deleteInBatches(
        (take) => prisma.outboundEmail.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take }),
        (ids) => prisma.outboundEmail.deleteMany({ where: { id: { in: ids } } }),
      ),
    },
    {
      rule: R.clientErrorLog,
      run: (cutoff) => deleteInBatches(
        (take) => prisma.clientErrorLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take }),
        (ids) => prisma.clientErrorLog.deleteMany({ where: { id: { in: ids } } }),
      ),
    },
    {
      rule: R.telegramMessage,
      run: (cutoff) => deleteInBatches(
        (take) => prisma.telegramMessage.findMany({ where: { sentAt: { lt: cutoff } }, select: { id: true }, take }),
        (ids) => prisma.telegramMessage.deleteMany({ where: { id: { in: ids } } }),
      ),
    },
    {
      rule: R.aiGenerationLog,
      run: (cutoff) => deleteInBatches(
        (take) => prisma.aiGenerationLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take }),
        (ids) => prisma.aiGenerationLog.deleteMany({ where: { id: { in: ids } } }),
      ),
    },
    {
      rule: R.jiraSyncLog,
      run: (cutoff) => deleteInBatches(
        (take) => prisma.jiraSyncLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take }),
        (ids) => prisma.jiraSyncLog.deleteMany({ where: { id: { in: ids } } }),
      ),
    },
  ]

  const results: TablePruneResult[] = []
  for (const job of jobs) {
    const days = retentionDays(job.rule)
    try {
      const { deleted, capped } = await job.run(cutoffFor(job.rule, now))
      results.push({ table: job.rule.table, retentionDays: days, deleted, capped })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[retention] ${job.rule.table} prune failed`, err)
      results.push({ table: job.rule.table, retentionDays: days, deleted: 0, capped: false, error: message })
    }
  }

  console.info(
    '[retention] pruned',
    results.map((r) => `${r.table}=${r.deleted}${r.capped ? '+' : ''}${r.error ? '(error)' : ''}`).join(' '),
  )
  return results
}
