/**
 * Dependency graph (CON-4): pure layout model, no React and no React Flow runtime.
 * Unit-tested in graph-model.test.ts.
 *
 * Two layouts, both read left to right ("who delivers" on the left, "who waits" on the right):
 *
 *   Person-centred (Links & dependencies tab):
 *     providers │ inbound dependencies │ PERSON │ outbound dependencies │ needers
 *
 *   Company (Dependency Map page):
 *     providers │ dependencies │ needers
 *
 * Every dependency is its own node, so one provider with three commitments
 * shows three edges rather than three overlapping lines. Edges carry a tone
 * (DEP-2 timing + status): late = danger, due soon = warn, done/dropped = muted.
 */
import { profileTabHref, type DependencyStatus, type DependencyType } from '@/types/package'

export type DependencyEdgeTone = 'danger' | 'warn' | 'open' | 'muted'

export interface GraphPerson {
  id: string
  name: string | null
  avatar: string | null
}

/**
 * The slice of a dependency row the graph needs. `DependencyRow` from
 * `@/features/dependencies` (detail and summary shapes) is assignable to it.
 */
export interface GraphDependency {
  id: string
  ref: string | null
  title: string
  status: DependencyStatus
  depType?: DependencyType
  neededByDate: string | null
  late: boolean
  dueSoon: boolean
  open: boolean
  href: string
  /** False for title + status summaries (§8): parties are not disclosed. */
  detail: boolean
  providers?: GraphPerson[]
  needers?: GraphPerson[]
}

export type PersonNodeRole = 'center' | 'provider' | 'needer'

export interface PersonNodeData {
  kind: 'person'
  person: GraphPerson
  role: PersonNodeRole
  /** Dependencies this node is connected to. */
  count: number
  /** Worst tone across those dependencies (danger › warn › open › muted). */
  tone: DependencyEdgeTone
  href: string
}

export interface DependencyNodeData {
  kind: 'dependency'
  dependency: GraphDependency
  tone: DependencyEdgeTone
  /** Person graph only: which side of the person the dependency sits on. */
  direction: 'inbound' | 'outbound' | null
  /** Summary row: parties are hidden from this viewer, so no person edges. */
  partiesHidden: boolean
}

export type DependencyGraphNodeData = PersonNodeData | DependencyNodeData

export const DEPENDENCY_GRAPH_NODE_TYPES = { person: 'dependencyPerson', dependency: 'dependencyItem' } as const

export interface DependencyGraphNode {
  id: string
  type: (typeof DEPENDENCY_GRAPH_NODE_TYPES)[keyof typeof DEPENDENCY_GRAPH_NODE_TYPES]
  position: { x: number; y: number }
  data: DependencyGraphNodeData
}

export interface DependencyGraphEdge {
  id: string
  source: string
  target: string
  data: { tone: DependencyEdgeTone; dependencyId: string }
}

export interface DependencyGraphStats {
  dependencies: number
  late: number
  dueSoon: number
  open: number
  closed: number
}

export interface DependencyGraphLayout {
  nodes: DependencyGraphNode[]
  edges: DependencyGraphEdge[]
  stats: DependencyGraphStats
  /** Dependencies drawn without person edges (summary rows). */
  withoutParties: number
  /** Dependencies left out because of the `max` cap (company graph). */
  truncated: number
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** Node footprints (px) — the node components render at these widths. */
export const GRAPH_SIZES = {
  dependencyWidth: 232,
  dependencyHeight: 88,
  personWidth: 188,
  personHeight: 52,
  centerWidth: 220,
  centerHeight: 76,
} as const

const DEP_GAP = 108
const PERSON_GAP = 68

const PERSON_COLUMNS = { provider: 0, inbound: 268, center: 580, outbound: 880, needer: 1192 } as const
const COMPANY_COLUMNS = { provider: 0, dependency: 300, needer: 632 } as const

// ─── Tones ───────────────────────────────────────────────────────────────────

const TONE_RANK: Record<DependencyEdgeTone, number> = { danger: 3, warn: 2, open: 1, muted: 0 }

/** Edge / node tone for one dependency (DEP-2 timing first, then status). */
export function dependencyEdgeTone(dep: Pick<GraphDependency, 'status' | 'late' | 'dueSoon' | 'open'>): DependencyEdgeTone {
  if (!dep.open || dep.status === 'DONE' || dep.status === 'DROPPED') return 'muted'
  if (dep.late || dep.status === 'BLOCKED') return 'danger'
  if (dep.dueSoon) return 'warn'
  return 'open'
}

export function worstTone(tones: readonly DependencyEdgeTone[]): DependencyEdgeTone {
  let worst: DependencyEdgeTone = 'muted'
  for (const tone of tones) if (TONE_RANK[tone] > TONE_RANK[worst]) worst = tone
  return worst
}

export const DEPENDENCY_TONE_LABELS: Record<DependencyEdgeTone, string> = {
  danger: 'Late or blocked',
  warn: 'Due within 7 days',
  open: 'Open',
  muted: 'Done or dropped',
}

export function graphStats(deps: readonly GraphDependency[]): DependencyGraphStats {
  let late = 0
  let dueSoon = 0
  let open = 0
  for (const dep of deps) {
    if (dep.open) open += 1
    if (dep.open && dep.late) late += 1
    else if (dep.open && dep.dueSoon) dueSoon += 1
  }
  return { dependencies: deps.length, late, dueSoon, open, closed: deps.length - open }
}

// ─── Column placement ────────────────────────────────────────────────────────

/** Centre y of row `index` in a column of `count` rows spaced `gap` apart, centred on 0. */
export function stackY(index: number, count: number, gap: number): number {
  return (index - (count - 1) / 2) * gap
}

/**
 * Places each key as close as possible to its desired y (the mean y of the
 * dependencies it touches) while keeping at least `gap` between neighbours,
 * then shifts the column so its mean matches the desired mean. Stable for ties.
 */
export function placeColumn(desired: ReadonlyArray<{ key: string; y: number }>, gap: number): Map<string, number> {
  const out = new Map<string, number>()
  if (desired.length === 0) return out
  const sorted = desired.map((d, i) => ({ ...d, i })).sort((a, b) => a.y - b.y || a.i - b.i)
  const placed: Array<{ key: string; y: number }> = []
  let prev = Number.NEGATIVE_INFINITY
  for (const d of sorted) {
    const y = Math.max(d.y, prev + gap)
    placed.push({ key: d.key, y })
    prev = y
  }
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length
  const shift = mean(desired.map((d) => d.y)) - mean(placed.map((p) => p.y))
  for (const p of placed) out.set(p.key, p.y + shift)
  return out
}

interface PartyAccumulator {
  person: GraphPerson
  ys: number[]
  tones: DependencyEdgeTone[]
}

function accumulate(
  map: Map<string, PartyAccumulator>,
  person: GraphPerson,
  y: number,
  tone: DependencyEdgeTone,
): void {
  const entry = map.get(person.id)
  if (entry) {
    entry.ys.push(y)
    entry.tones.push(tone)
    if (!entry.person.name && person.name) entry.person = person
  } else {
    map.set(person.id, { person, ys: [y], tones: [tone] })
  }
}

function personNodes(
  parties: Map<string, PartyAccumulator>,
  prefix: string,
  role: PersonNodeRole,
  x: number,
): DependencyGraphNode[] {
  const desired = Array.from(parties.entries()).map(([key, acc]) => ({
    key,
    y: acc.ys.reduce((s, v) => s + v, 0) / acc.ys.length,
  }))
  const placed = placeColumn(desired, PERSON_GAP)
  return Array.from(parties.entries()).map(([key, acc]) => ({
    id: `${prefix}:${key}`,
    type: DEPENDENCY_GRAPH_NODE_TYPES.person,
    position: { x, y: (placed.get(key) ?? 0) - GRAPH_SIZES.personHeight / 2 },
    data: {
      kind: 'person',
      person: acc.person,
      role,
      count: acc.ys.length,
      tone: worstTone(acc.tones),
      href: profileTabHref(acc.person.id, 'links'),
    },
  }))
}

function dependencyNode(
  id: string,
  dep: GraphDependency,
  x: number,
  y: number,
  direction: DependencyNodeData['direction'],
): DependencyGraphNode {
  return {
    id,
    type: DEPENDENCY_GRAPH_NODE_TYPES.dependency,
    position: { x, y: y - GRAPH_SIZES.dependencyHeight / 2 },
    data: {
      kind: 'dependency',
      dependency: dep,
      tone: dependencyEdgeTone(dep),
      direction,
      partiesHidden: !dep.detail,
    },
  }
}

function edge(source: string, target: string, dep: GraphDependency): DependencyGraphEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    data: { tone: dependencyEdgeTone(dep), dependencyId: dep.id },
  }
}

// ─── Person-centred graph ────────────────────────────────────────────────────

export const PERSON_GRAPH_CENTER_ID = 'center'

export function dependencyNodeId(prefix: 'in' | 'out' | 'dep', dependencyId: string): string {
  return `${prefix}:${dependencyId}`
}

/**
 * Person in the centre, inbound dependencies (the person is a NEEDER) with
 * their providers on the left, outbound dependencies (the person is a
 * PROVIDER) with their needers on the right (DEP-1, CON-4).
 */
export function buildPersonDependencyGraph(input: {
  subject: GraphPerson
  inbound: readonly GraphDependency[]
  outbound: readonly GraphDependency[]
}): DependencyGraphLayout {
  const { subject, inbound, outbound } = input
  const nodes: DependencyGraphNode[] = []
  const edges: DependencyGraphEdge[] = []
  const providers = new Map<string, PartyAccumulator>()
  const needers = new Map<string, PartyAccumulator>()
  let withoutParties = 0

  inbound.forEach((dep, i) => {
    const y = stackY(i, inbound.length, DEP_GAP)
    const id = dependencyNodeId('in', dep.id)
    nodes.push(dependencyNode(id, dep, PERSON_COLUMNS.inbound, y, 'inbound'))
    edges.push(edge(id, PERSON_GRAPH_CENTER_ID, dep))
    const others = (dep.providers ?? []).filter((p) => p.id !== subject.id)
    if (!dep.detail) withoutParties += 1
    for (const provider of others) {
      accumulate(providers, provider, y, dependencyEdgeTone(dep))
      edges.push(edge(`prov:${provider.id}`, id, dep))
    }
  })

  outbound.forEach((dep, i) => {
    const y = stackY(i, outbound.length, DEP_GAP)
    const id = dependencyNodeId('out', dep.id)
    nodes.push(dependencyNode(id, dep, PERSON_COLUMNS.outbound, y, 'outbound'))
    edges.push(edge(PERSON_GRAPH_CENTER_ID, id, dep))
    const others = (dep.needers ?? []).filter((p) => p.id !== subject.id)
    if (!dep.detail) withoutParties += 1
    for (const needer of others) {
      accumulate(needers, needer, y, dependencyEdgeTone(dep))
      edges.push(edge(id, `need:${needer.id}`, dep))
    }
  })

  nodes.push(...personNodes(providers, 'prov', 'provider', PERSON_COLUMNS.provider))
  nodes.push(...personNodes(needers, 'need', 'needer', PERSON_COLUMNS.needer))

  const all = [...inbound, ...outbound]
  nodes.unshift({
    id: PERSON_GRAPH_CENTER_ID,
    type: DEPENDENCY_GRAPH_NODE_TYPES.person,
    position: { x: PERSON_COLUMNS.center, y: -GRAPH_SIZES.centerHeight / 2 },
    data: {
      kind: 'person',
      person: subject,
      role: 'center',
      count: all.length,
      tone: worstTone(all.map(dependencyEdgeTone)),
      href: profileTabHref(subject.id, 'links'),
    },
  })

  return { nodes, edges, stats: graphStats(dedupeById(all)), withoutParties, truncated: 0 }
}

function dedupeById(deps: readonly GraphDependency[]): GraphDependency[] {
  const seen = new Set<string>()
  return deps.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
}

/** Finds the person's display record among the rows' parties (no extra fetch needed). */
export function findPersonInDependencies(
  userId: string,
  rows: readonly GraphDependency[],
): GraphPerson | null {
  for (const row of rows) {
    for (const p of [...(row.providers ?? []), ...(row.needers ?? [])]) {
      if (p.id === userId && p.name) return p
    }
  }
  return null
}

// ─── Company graph ───────────────────────────────────────────────────────────

export const COMPANY_GRAPH_DEFAULT_MAX = 400

/**
 * Providers on the left, every dependency in the middle, needers on the right
 * (DEP-6 + CON-4). A person who both provides and needs appears in both
 * columns. People sit at the mean height of the dependencies they touch to
 * keep edges short.
 */
export function buildCompanyDependencyGraph(
  deps: readonly GraphDependency[],
  options: { max?: number } = {},
): DependencyGraphLayout {
  const max = Math.max(1, options.max ?? COMPANY_GRAPH_DEFAULT_MAX)
  const shown = dedupeById(deps).slice(0, max)
  const nodes: DependencyGraphNode[] = []
  const edges: DependencyGraphEdge[] = []
  const providers = new Map<string, PartyAccumulator>()
  const needers = new Map<string, PartyAccumulator>()
  let withoutParties = 0

  shown.forEach((dep, i) => {
    const y = stackY(i, shown.length, DEP_GAP)
    const id = dependencyNodeId('dep', dep.id)
    nodes.push(dependencyNode(id, dep, COMPANY_COLUMNS.dependency, y, null))
    if (!dep.detail) {
      withoutParties += 1
      return
    }
    const tone = dependencyEdgeTone(dep)
    for (const provider of dep.providers ?? []) {
      accumulate(providers, provider, y, tone)
      edges.push(edge(`prov:${provider.id}`, id, dep))
    }
    for (const needer of dep.needers ?? []) {
      accumulate(needers, needer, y, tone)
      edges.push(edge(id, `need:${needer.id}`, dep))
    }
  })

  nodes.push(...personNodes(providers, 'prov', 'provider', COMPANY_COLUMNS.provider))
  nodes.push(...personNodes(needers, 'need', 'needer', COMPANY_COLUMNS.needer))

  return {
    nodes,
    edges,
    stats: graphStats(shown),
    withoutParties,
    truncated: Math.max(0, dedupeById(deps).length - shown.length),
  }
}
