/**
 * One-off, idempotent migration of the EMPLOYEE role's `todo` RecordScopeRule
 * (user decision 2026-09-25, docs/REMEDIATION_PLAN_2026-09-25.md "Decisions").
 *
 *   before: assigneeId  equals          user_id   → only cards assigned to me
 *   after : participant is_participant  user_id   → assignee · creator · card member ·
 *           watcher (read only) · owner/participant of the card's sprint
 *
 * `is_participant` is resolved by lib/apply-scope.ts → todoParticipantScopeWhere
 * (lib/todos/visibility.ts), so DEPLOY THE CODE FIRST: an old build treats the
 * unknown operator as "no restriction" for that rule.
 *
 * Usage (uses DATABASE_URL from the environment / .env):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/update-employee-todo-scope.ts           # dry run
 *   npx tsx --tsconfig tsconfig.json scripts/update-employee-todo-scope.ts --apply   # write
 *
 * What --apply does (in one transaction), for rules with targetType='role',
 * targetId=<EMPLOYEE role id>, doctypeKey='todo':
 *   - no participant rule yet + a legacy `assigneeId equals user_id` rule → the legacy
 *     row is UPDATED IN PLACE to the participant definition (id and isActive kept);
 *   - no participant rule and no legacy rule → a participant rule is CREATED (active);
 *   - legacy rules left over next to a participant rule are DELETED (rules of one role
 *     are ANDed, so a leftover would still cut employees down to assigned-only);
 *   - duplicate participant rules are DELETED (the oldest is kept).
 * Any other EMPLOYEE `todo` rule (admin-made) is left alone and listed as a warning,
 * because it is ANDed with the participant rule. Re-running after --apply is a no-op.
 */
import { prisma } from '../lib/prisma'
import { TODO_PARTICIPANT_SCOPE_RULE } from '../lib/todos/visibility'

const db = prisma as any

type Rule = {
  id: string
  targetType: string
  targetId: string
  doctypeKey: string
  fieldName: string
  operator: string
  valueType: string
  staticValue: string | null
  isActive: boolean
  createdAt: Date
}

const LEGACY = { fieldName: 'assigneeId', operator: 'equals', valueType: 'user_id' } as const
const TARGET = TODO_PARTICIPANT_SCOPE_RULE

const isLegacy = (r: Rule) =>
  r.fieldName === LEGACY.fieldName && r.operator === LEGACY.operator && r.valueType === LEGACY.valueType
const isTarget = (r: Rule) =>
  r.fieldName === TARGET.fieldName && r.operator === TARGET.operator && r.valueType === TARGET.valueType

function print(label: string, rules: Rule[]) {
  console.log(`\n## ${label} — EMPLOYEE role, doctype 'todo' (${rules.length} rule${rules.length === 1 ? '' : 's'})`)
  if (rules.length === 0) console.log('  (none)')
  for (const r of rules) {
    const kind = isTarget(r) ? 'participant' : isLegacy(r) ? 'LEGACY' : 'other'
    console.log(
      `  ${r.id}  ${r.fieldName} ${r.operator} ${r.valueType}${r.staticValue ? ` (${r.staticValue})` : ''}` +
        `  active=${r.isActive}  [${kind}]`,
    )
  }
}

async function loadRules(roleId: string): Promise<Rule[]> {
  return db.recordScopeRule.findMany({
    where: { targetType: 'role', targetId: roleId, doctypeKey: TARGET.doctypeKey },
    orderBy: { createdAt: 'asc' },
  })
}

type Plan =
  | { kind: 'update'; id: string }
  | { kind: 'create' }
  | { kind: 'delete'; id: string; why: string }

function plan(rules: Rule[]): Plan[] {
  const steps: Plan[] = []
  const targets = rules.filter(isTarget)
  const legacy = rules.filter(isLegacy)

  if (targets.length === 0) {
    if (legacy.length > 0) {
      steps.push({ kind: 'update', id: legacy[0].id })
      for (const r of legacy.slice(1)) steps.push({ kind: 'delete', id: r.id, why: 'duplicate legacy rule' })
    } else {
      steps.push({ kind: 'create' })
    }
  } else {
    for (const r of legacy) steps.push({ kind: 'delete', id: r.id, why: 'legacy rule ANDed next to the participant rule' })
    for (const r of targets.slice(1)) steps.push({ kind: 'delete', id: r.id, why: 'duplicate participant rule' })
  }
  return steps
}

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.DATABASE_URL ?? ''
  console.log(`# update-employee-todo-scope — DB host: ${url.replace(/^.*@/, '').replace(/\?.*$/, '') || '(unset)'}`)
  console.log(`# mode: ${apply ? 'APPLY (writes)' : 'dry run (no writes; pass --apply to write)'}`)
  console.log(`# target rule: ${TARGET.fieldName} ${TARGET.operator} ${TARGET.valueType}`)

  const role = await db.role.findFirst({ where: { key: 'EMPLOYEE' }, select: { id: true, name: true } })
  if (!role) {
    console.log('\nNo RBAC role with key EMPLOYEE — nothing to do (run scripts/seed-permissions.ts first).')
    return
  }
  const doctype = await db.docTypeRegistry.findUnique({ where: { key: TARGET.doctypeKey }, select: { key: true } })
  if (!doctype) {
    console.log(`\nDocType '${TARGET.doctypeKey}' is not registered — nothing to do (run scripts/seed-permissions.ts first).`)
    return
  }

  const before = await loadRules(role.id)
  print('BEFORE', before)

  const steps = plan(before)
  console.log('\n## Plan')
  if (steps.length === 0) console.log('  nothing to change — already migrated')
  for (const s of steps) {
    if (s.kind === 'update') console.log(`  UPDATE ${s.id} → ${TARGET.fieldName} ${TARGET.operator} ${TARGET.valueType} (id and isActive kept)`)
    if (s.kind === 'create') console.log(`  CREATE ${TARGET.fieldName} ${TARGET.operator} ${TARGET.valueType} (active)`)
    if (s.kind === 'delete') console.log(`  DELETE ${s.id} (${s.why})`)
  }

  for (const r of before.filter((r) => !isTarget(r) && !isLegacy(r))) {
    console.log(`  WARNING: other EMPLOYEE todo rule ${r.id} (${r.fieldName} ${r.operator} ${r.valueType}) is kept and ANDed with the participant rule`)
  }

  if (apply && steps.length > 0) {
    await prisma.$transaction(async (tx) => {
      const t = tx as any
      for (const s of steps) {
        if (s.kind === 'update') {
          await t.recordScopeRule.update({
            where: { id: s.id },
            data: { fieldName: TARGET.fieldName, operator: TARGET.operator, valueType: TARGET.valueType, staticValue: null },
          })
        } else if (s.kind === 'create') {
          await t.recordScopeRule.create({
            data: {
              targetType: 'role',
              targetId: role.id,
              doctypeKey: TARGET.doctypeKey,
              fieldName: TARGET.fieldName,
              operator: TARGET.operator,
              valueType: TARGET.valueType,
              staticValue: null,
              isActive: true,
            },
          })
        } else {
          await t.recordScopeRule.delete({ where: { id: s.id } })
        }
      }
    })
  }

  const after = apply ? await loadRules(role.id) : before
  print(apply ? 'AFTER' : 'AFTER (unchanged — dry run)', after)

  const active = after.filter((r) => isTarget(r) && r.isActive)
  if (apply && after.filter(isTarget).length > 0 && active.length === 0) {
    console.log(
      '\nWARNING: the participant rule exists but is INACTIVE (an admin had disabled the old rule). ' +
        'Employees then have NO todo record scope — enable it in Settings → Permissions → Record scoping if intended.',
    )
  }
  console.log(apply ? '\nDone.' : '\nDry run complete — re-run with --apply to write.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
