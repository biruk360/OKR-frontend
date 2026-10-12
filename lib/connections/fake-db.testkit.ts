/**
 * Minimal in-memory stand-in for the Prisma client, used by the okr-links and
 * connections service tests. Supports the `where` shapes those services use:
 * equality, `{ in }`, `{ not }`, `AND`, `OR` and nested relation objects.
 * `select` / `include` / `orderBy` are ignored — fixture rows carry their relations.
 * Test-only (not matched by the `*.test.ts` runner glob).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>

export function matches(row: Row | null | undefined, where: any): boolean {
  if (!where) return true
  if (!row) return false
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as any[]).every((w) => matches(row, w))) return false
      continue
    }
    if (key === 'OR') {
      if (!(cond as any[]).some((w) => matches(row, w))) return false
      continue
    }
    const value = row[key]
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) {
        if (!(cond as any).in.includes(value)) return false
        continue
      }
      if ('not' in cond) {
        if (value === (cond as any).not) return false
        continue
      }
      if (!matches(value, cond)) return false
      continue
    }
    if (value !== cond) return false
  }
  return true
}

let seq = 0

export function fakeModel(rows: Row[]) {
  return {
    rows,
    async findUnique({ where }: any) {
      return rows.find((r) => matches(r, where)) ?? null
    },
    async findFirst({ where }: any = {}) {
      return rows.find((r) => matches(r, where)) ?? null
    },
    async findMany({ where }: any = {}) {
      return rows.filter((r) => matches(r, where))
    },
    async count({ where }: any = {}) {
      return rows.filter((r) => matches(r, where)).length
    },
    async create({ data }: any) {
      const row = { id: `gen-${++seq}`, createdAt: new Date(), ...data }
      rows.push(row)
      return row
    },
    async update({ where, data }: any) {
      const row = rows.find((r) => matches(r, where))
      if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' })
      Object.assign(row, data)
      return row
    },
    async updateMany({ where, data }: any) {
      const hit = rows.filter((r) => matches(r, where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
    async delete({ where }: any) {
      const i = rows.findIndex((r) => matches(r, where))
      if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
      return rows.splice(i, 1)[0]
    },
  }
}

export type FakeDb = Record<string, ReturnType<typeof fakeModel>> & {
  $transaction: (fn: (tx: any) => Promise<any>) => Promise<any>
}

/** Build a fake client with the given tables (missing tables are empty). */
export function fakeDb(tables: Record<string, Row[]>): FakeDb {
  const names = [
    'objective',
    'keyResult',
    'okrLink',
    'activityLog',
    'todo',
    'kpi',
    'recurringDuty',
    'developmentItem',
    'milestone',
    'workDependencyLink',
    'decisionLink',
    'managerRelationship',
    'departmentMembership',
  ]
  const db: any = {}
  for (const name of names) db[name] = fakeModel(tables[name] ?? [])
  db.$transaction = async (fn: (tx: any) => Promise<any>) => fn(db)
  return db as FakeDb
}
