import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import ts from 'typescript'

/**
 * Static invariants for the React Server Component boundary.
 *
 * Three production crashes (2026-09-27 browser E2E, report E2 D2/D3a) came from
 * the same class of mistake, invisible to `tsc` and to the build:
 *
 *  1. A server component passed a Lucide icon COMPONENT (`icon={AlertCircle}`)
 *     to the client `EmptyState` → "Functions cannot be passed directly to
 *     Client Components" (Explorer → Map, empty timeframe).
 *  2. A server component CALLED `normalizeStatus`, a plain function exported
 *     from a `'use client'` module. On the server every export of a client
 *     module is a client reference, not the function → "is not a function"
 *     (Insights → Progress → Tracking).
 *
 * The scan walks the server module graph from every non-client `app/` entry
 * (page/layout/template/not-found/default/loading), stopping at `'use client'`
 * modules, and fails if a server module:
 *   - uses a binding imported (directly or through a barrel) from a client
 *     module as anything other than a JSX tag, or
 *   - passes a function (arrow/function expression, a Lucide icon, or a local
 *     function) as a prop to a client component.
 *
 * Plus: the Move modal's HTTP method must be one both OKR routes export (it
 * shipped as PATCH against GET/PUT/DELETE routes → 405, report E2 D1).
 */

const ROOT = join(__dirname, '..', '..')
const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const EXTS = ['.tsx', '.ts', '.jsx', '.js']
const ENTRY_RE = /^(page|layout|template|not-found|default|loading)\.(tsx|ts|jsx|js)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (ENTRY_RE.test(entry)) out.push(full)
  }
  return out
}

const sourceCache = new Map<string, ts.SourceFile>()
function parse(file: string): ts.SourceFile {
  let sf = sourceCache.get(file)
  if (!sf) {
    sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    sourceCache.set(file, sf)
  }
  return sf
}

function directive(file: string): 'client' | 'server' | null {
  const first = parse(file).statements[0]
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) {
    if (first.expression.text === 'use client') return 'client'
    if (first.expression.text === 'use server') return 'server'
  }
  return null
}
const isClient = (f: string) => directive(f) === 'client'

/** Resolves an import specifier to a project file, or null for packages. */
function resolve(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile() && EXTS.some((e) => c.endsWith(e))) return c
  }
  return null
}

/**
 * Follows `export { x } from` / `export * from` through non-client barrels and
 * returns the module that actually defines `name` (or the barrel itself when it
 * defines it). `name === 'default'` for default imports.
 */
function originOf(file: string, name: string, seen = new Set<string>()): string {
  if (seen.has(file + '#' + name) || isClient(file)) return file
  seen.add(file + '#' + name)
  const sf = parse(file)
  const stars: string[] = []
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const target = resolve(st.moduleSpecifier.text, file)
    if (!target) continue
    if (!st.exportClause) { stars.push(target); continue }
    if (ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        if (el.name.text === name) return originOf(target, (el.propertyName ?? el.name).text, seen)
      }
    }
  }
  for (const target of stars) {
    const o = originOf(target, name, seen)
    if (o !== target || exportsName(target, name)) return o
  }
  return file
}

function exportsName(file: string, name: string): boolean {
  const sf = parse(file)
  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined
    const exported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    const isDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    if (exported && isDefault && name === 'default') return true
    if (exported && (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name?.text === name) return true
    if (exported && ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return true
    }
    if (ts.isExportAssignment(st) && name === 'default') return true
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      if (st.exportClause.elements.some((el) => el.name.text === name)) return true
    }
  }
  return false
}

interface Binding { local: string; origin: string; imported: string; fromLucide: boolean; fromUseServer: boolean }

function importsOf(file: string): { bindings: Binding[]; deps: string[] } {
  const sf = parse(file)
  const bindings: Binding[] = []
  const deps: string[] = []
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const clause = st.importClause
    if (!clause || clause.isTypeOnly) continue
    const spec = st.moduleSpecifier.text
    const target = resolve(spec, file)
    const fromLucide = spec === 'lucide-react'
    const add = (local: string, imported: string) => {
      if (!target) { bindings.push({ local, origin: spec, imported, fromLucide, fromUseServer: false }); return }
      const origin = originOf(target, imported)
      bindings.push({ local, origin, imported, fromLucide, fromUseServer: directive(origin) === 'server' })
      if (!isClient(origin)) deps.push(origin)
    }
    if (target && !isClient(target)) deps.push(target)
    if (clause.name) add(clause.name.text, 'default')
    const nb = clause.namedBindings
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) if (!el.isTypeOnly) add(el.name.text, (el.propertyName ?? el.name).text)
    } else if (nb && ts.isNamespaceImport(nb) && target) {
      bindings.push({ local: nb.name.text, origin: target, imported: '*', fromLucide, fromUseServer: false })
    }
  }
  return { bindings, deps }
}

function isTypePosition(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true
    if (ts.isStatement(p) || ts.isExpression(p) && !ts.isIdentifier(p)) return false
  }
  return false
}

function isJsxTagName(id: ts.Identifier): boolean {
  const p = id.parent
  return (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === id
}

const isImportPart = (id: ts.Identifier) =>
  ts.isImportSpecifier(id.parent) || ts.isImportClause(id.parent) || ts.isNamespaceImport(id.parent)

function scanServerModule(file: string): string[] {
  const sf = parse(file)
  const { bindings } = importsOf(file)
  const byLocal = new Map(bindings.map((b) => [b.local, b]))
  const clientLocals = new Set(bindings.filter((b) => b.origin.startsWith(ROOT) && isClient(b.origin)).map((b) => b.local))
  const localFns = new Set<string>()
  const problems: string[] = []
  const at = (n: ts.Node) => `${rel(file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`

  const collectFns = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.parent === sf) localFns.add(n.name.text)
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer &&
        (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) &&
        n.parent.parent.parent === sf) localFns.add(n.name.text)
  }
  sf.statements.forEach(collectFns)

  const visit = (n: ts.Node) => {
    // (a) client-module exports may only be rendered as JSX tags.
    if (ts.isIdentifier(n) && clientLocals.has(n.text) && !isImportPart(n) && !isJsxTagName(n) &&
        !isTypePosition(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) &&
        !(ts.isPropertyAssignment(n.parent) && n.parent.name === n) && !ts.isJsxAttribute(n.parent)) {
      problems.push(`${at(n)} uses "${n.text}" from 'use client' module ${rel(byLocal.get(n.text)!.origin)} as a value (only <${n.text} /> works on the server)`)
    }
    // (b) no function-valued props on client components.
    if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
      const owner = n.parent.parent
      const tag = (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) ? owner.tagName : null
      const tagName = tag && ts.isIdentifier(tag) ? tag.text : tag && ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) ? tag.expression.text : null
      if (tagName && clientLocals.has(tagName)) {
        // Walk the prop value (object/array literals included, e.g.
        // `items={[{ icon: Target }]}`), skipping rendered JSX (elements are
        // serialisable) and callbacks passed to calls (`rows.map((r) => …)`).
        const isFnIdent = (id: ts.Identifier) => {
          const b = byLocal.get(id.text)
          return !!(b?.fromLucide || localFns.has(id.text) ||
            (b && b.origin.startsWith(ROOT) && !isClient(b.origin) && !b.fromUseServer && /^[A-Z]/.test(id.text) && b.origin.endsWith('x')))
        }
        let fnValue = false
        const check = (x: ts.Node) => {
          if (fnValue || ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) return
          const inCallArgs = ts.isCallExpression(x.parent) && x.parent.arguments.includes(x as ts.Expression)
          if ((ts.isArrowFunction(x) || ts.isFunctionExpression(x)) && !inCallArgs) { fnValue = true; return }
          if (ts.isIdentifier(x) && isFnIdent(x) &&
              !(ts.isCallExpression(x.parent) && x.parent.expression === x) &&
              !(ts.isPropertyAccessExpression(x.parent) && x.parent.name === x) &&
              !(ts.isPropertyAssignment(x.parent) && x.parent.name === x)) { fnValue = true; return }
          if (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) return
          ts.forEachChild(x, check)
        }
        check(n.initializer.expression)
        if (fnValue) problems.push(`${at(n)} passes a function to <${tagName} ${n.name.getText()}={…}> (a client component) — render the element instead`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return problems
}

test('server components never use a client-module export as a value, nor pass functions to client components', () => {
  const entries = walk(join(ROOT, 'app')).filter((f) => !isClient(f))
  assert.ok(entries.length > 20, 'expected to find app/ page entries')
  const seen = new Set<string>()
  const queue = [...entries]
  const problems: string[] = []
  while (queue.length) {
    const f = queue.pop()!
    if (seen.has(f) || isClient(f)) continue
    seen.add(f)
    if (f.includes('.test.')) continue
    problems.push(...scanServerModule(f))
    for (const d of importsOf(f).deps) if (!seen.has(d)) queue.push(d)
  }
  assert.ok(seen.size > entries.length, 'expected the server graph to extend past the entries')
  assert.deepEqual(problems, [], `RSC boundary violations:\n${problems.join('\n')}`)
})

test('the scanner catches the two shipped regressions', () => {
  // Guard against the scan silently matching nothing: the helpers it relies on
  // must recognise the exact modules that broke.
  assert.equal(isClient(join(ROOT, 'components/ui/EmptyState.tsx')), true)
  assert.equal(isClient(join(ROOT, 'components/shared/StatusPill.tsx')), true)
  assert.equal(isClient(join(ROOT, 'lib/status-key.ts')), false)
})

test('MoveOkrModal sends a method both OKR routes export', () => {
  const modal = readFileSync(join(ROOT, 'components/shared/MoveOkrModal.tsx'), 'utf8')
  const m = modal.match(/export const MOVE_OKR_METHOD = '([A-Z]+)'/)
  assert.ok(m, 'MoveOkrModal must export MOVE_OKR_METHOD')
  assert.match(modal, /method: MOVE_OKR_METHOD/, 'the move fetch must use MOVE_OKR_METHOD')
  assert.doesNotMatch(modal, /method: '(PATCH|POST|PUT)'/, 'no hard-coded method in the move fetch')
  for (const route of ['app/api/objectives/[id]/route.ts', 'app/api/keyresults/[id]/route.ts']) {
    const src = readFileSync(join(ROOT, route), 'utf8')
    assert.match(src, new RegExp(`export const ${m![1]} = `), `${route} must export ${m![1]}`)
  }
  // The move logic itself lives in that handler.
  const kr = readFileSync(join(ROOT, 'app/api/keyresults/[id]/route.ts'), 'utf8')
  const handler = kr.slice(kr.indexOf(`export const ${m![1]} = `), kr.indexOf('export const DELETE'))
  assert.match(handler, /objectiveId: rawTargetObjectiveId/)
  assert.match(handler, /recalcNodeAndAncestors\(tx, targetObjectiveId/, 'new parent rollup must run inside the transaction')
  const obj = readFileSync(join(ROOT, 'app/api/objectives/[id]/route.ts'), 'utf8')
  const objHandler = obj.slice(obj.indexOf(`export const ${m![1]} = `), obj.indexOf('export const DELETE'))
  assert.match(objHandler, /wouldCreateAlignmentCycle/)
  assert.match(objHandler, /recalcNodeAndAncestors\(tx, oldParentId\)/)
})

test('Insights → Initiatives tolerates unassigned initiatives (assignee: null)', () => {
  // /api/initiative-report returns `assignee: null` for unassigned to-dos; an
  // unguarded `.assignee.name` crashed the whole tab for every role (E2 D3b).
  const src = readFileSync(join(ROOT, 'components/initiative-report/InitiativeReportClient.tsx'), 'utf8')
  assert.doesNotMatch(src, /\.assignee\.name/, 'read the assignee through assigneeLabel() / optional chaining')
  assert.match(src, /assignee: \{[^}]*\} \| null/, 'ReportRow.assignee must be typed nullable')
})
