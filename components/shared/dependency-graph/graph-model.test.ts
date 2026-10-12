import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCompanyDependencyGraph,
  buildPersonDependencyGraph,
  dependencyEdgeTone,
  findPersonInDependencies,
  graphStats,
  placeColumn,
  PERSON_GRAPH_CENTER_ID,
  stackY,
  worstTone,
  type GraphDependency,
  type GraphPerson,
  type PersonNodeData,
} from './graph-model'

const person = (id: string, name = id.toUpperCase()): GraphPerson => ({ id, name, avatar: null })

function dep(partial: Partial<GraphDependency> & { id: string }): GraphDependency {
  return {
    ref: null,
    title: partial.id,
    status: 'OPEN',
    neededByDate: null,
    late: false,
    dueSoon: false,
    open: true,
    href: `/dashboard/okrs-all/dependencies?dependency=${partial.id}`,
    detail: true,
    providers: [],
    needers: [],
    ...partial,
  }
}

describe('dependencyEdgeTone', () => {
  it('late and blocked are danger, due soon warn, closed muted, else open', () => {
    assert.equal(dependencyEdgeTone(dep({ id: 'a', late: true })), 'danger')
    assert.equal(dependencyEdgeTone(dep({ id: 'b', status: 'BLOCKED' })), 'danger')
    assert.equal(dependencyEdgeTone(dep({ id: 'c', dueSoon: true })), 'warn')
    assert.equal(dependencyEdgeTone(dep({ id: 'd', status: 'DONE', open: false, late: false })), 'muted')
    assert.equal(dependencyEdgeTone(dep({ id: 'e', status: 'DROPPED', open: false })), 'muted')
    assert.equal(dependencyEdgeTone(dep({ id: 'f', status: 'IN_PROGRESS' })), 'open')
  })

  it('a closed row never reads as late even if the flag leaked through', () => {
    assert.equal(dependencyEdgeTone(dep({ id: 'g', status: 'DONE', open: false, late: true })), 'muted')
  })

  it('worstTone ranks danger › warn › open › muted', () => {
    assert.equal(worstTone([]), 'muted')
    assert.equal(worstTone(['open', 'muted']), 'open')
    assert.equal(worstTone(['open', 'warn', 'muted']), 'warn')
    assert.equal(worstTone(['warn', 'danger']), 'danger')
  })
})

describe('column placement', () => {
  it('stackY centres rows on zero', () => {
    assert.deepEqual([0, 1, 2].map((i) => stackY(i, 3, 100)), [-100, 0, 100])
    assert.equal(stackY(0, 1, 100), 0)
  })

  it('placeColumn keeps the minimum gap and the desired mean', () => {
    const placed = placeColumn(
      [
        { key: 'a', y: 0 },
        { key: 'b', y: 0 },
        { key: 'c', y: 10 },
      ],
      50,
    )
    const ys = ['a', 'b', 'c'].map((k) => placed.get(k)!)
    assert.ok(ys[1] - ys[0] >= 50 - 1e-9)
    assert.ok(ys[2] - ys[1] >= 50 - 1e-9)
    const mean = ys.reduce((s, v) => s + v, 0) / 3
    assert.ok(Math.abs(mean - 10 / 3) < 1e-9)
  })

  it('placeColumn leaves well-spaced keys where they asked to be', () => {
    const placed = placeColumn(
      [
        { key: 'a', y: -200 },
        { key: 'b', y: 200 },
      ],
      50,
    )
    assert.equal(placed.get('a'), -200)
    assert.equal(placed.get('b'), 200)
  })
})

describe('buildPersonDependencyGraph', () => {
  const me = person('me', 'Me')
  const inbound = [
    dep({ id: 'd1', late: true, providers: [person('p1')], needers: [me] }),
    dep({ id: 'd2', providers: [person('p1'), person('p2')], needers: [me] }),
  ]
  const outbound = [dep({ id: 'd3', dueSoon: true, providers: [me], needers: [person('n1'), me] })]
  const graph = buildPersonDependencyGraph({ subject: me, inbound, outbound })

  it('puts the person in the centre, providers left and needers right', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    const center = byId.get(PERSON_GRAPH_CENTER_ID)!
    const p1 = byId.get('prov:p1')!
    const n1 = byId.get('need:n1')!
    const d1 = byId.get('in:d1')!
    const d3 = byId.get('out:d3')!
    assert.ok(p1.position.x < d1.position.x)
    assert.ok(d1.position.x < center.position.x)
    assert.ok(center.position.x < d3.position.x)
    assert.ok(d3.position.x < n1.position.x)
  })

  it('never draws the subject as their own counterparty', () => {
    assert.equal(graph.nodes.some((n) => n.id === 'need:me' || n.id === 'prov:me'), false)
  })

  it('wires provider → dependency → person → dependency → needer with status tones', () => {
    const edges = new Map(graph.edges.map((e) => [e.id, e]))
    assert.equal(edges.get('prov:p1->in:d1')?.data.tone, 'danger')
    assert.equal(edges.get(`in:d1->${PERSON_GRAPH_CENTER_ID}`)?.data.tone, 'danger')
    assert.equal(edges.get('prov:p2->in:d2')?.data.tone, 'open')
    assert.equal(edges.get(`${PERSON_GRAPH_CENTER_ID}->out:d3`)?.data.tone, 'warn')
    assert.equal(edges.get('out:d3->need:n1')?.data.tone, 'warn')
    assert.equal(graph.edges.length, 7)
  })

  it('people carry their dependency count and worst tone', () => {
    const p1 = graph.nodes.find((n) => n.id === 'prov:p1')!.data as PersonNodeData
    assert.equal(p1.count, 2)
    assert.equal(p1.tone, 'danger')
    assert.equal(p1.href, '/dashboard/org/users/p1?tab=links')
    const center = graph.nodes.find((n) => n.id === PERSON_GRAPH_CENTER_ID)!.data as PersonNodeData
    assert.equal(center.count, 3)
    assert.equal(center.role, 'center')
  })

  it('summary rows connect to the person only and are counted', () => {
    const g = buildPersonDependencyGraph({
      subject: me,
      inbound: [dep({ id: 's1', detail: false, providers: undefined, needers: undefined })],
      outbound: [],
    })
    assert.equal(g.withoutParties, 1)
    assert.deepEqual(
      g.edges.map((e) => e.id),
      [`in:s1->${PERSON_GRAPH_CENTER_ID}`],
    )
  })

  it('stats count each dependency once even when it is both inbound and outbound', () => {
    const both = dep({ id: 'x', providers: [me], needers: [me] })
    const g = buildPersonDependencyGraph({ subject: me, inbound: [both], outbound: [both] })
    assert.equal(g.stats.dependencies, 1)
    assert.equal(g.nodes.filter((n) => n.data.kind === 'dependency').length, 2)
  })
})

describe('buildCompanyDependencyGraph', () => {
  it('lays providers, dependencies and needers out in three columns', () => {
    const g = buildCompanyDependencyGraph([
      dep({ id: 'a', providers: [person('u1')], needers: [person('u2')] }),
      dep({ id: 'b', providers: [person('u2')], needers: [person('u3')], status: 'DONE', open: false }),
    ])
    const ids = g.nodes.map((n) => n.id).sort()
    assert.deepEqual(ids, ['dep:a', 'dep:b', 'need:u2', 'need:u3', 'prov:u1', 'prov:u2'])
    const x = (id: string) => g.nodes.find((n) => n.id === id)!.position.x
    assert.ok(x('prov:u1') < x('dep:a') && x('dep:a') < x('need:u2'))
    assert.equal(g.edges.find((e) => e.id === 'dep:b->need:u3')?.data.tone, 'muted')
    assert.deepEqual(g.stats, { dependencies: 2, late: 0, dueSoon: 0, open: 1, closed: 1 })
  })

  it('caps the node count and reports what was left out', () => {
    const deps = Array.from({ length: 5 }, (_, i) => dep({ id: `d${i}` }))
    const g = buildCompanyDependencyGraph(deps, { max: 3 })
    assert.equal(g.nodes.filter((n) => n.data.kind === 'dependency').length, 3)
    assert.equal(g.truncated, 2)
  })

  it('draws summary rows without person edges', () => {
    const g = buildCompanyDependencyGraph([dep({ id: 's', detail: false, providers: undefined })])
    assert.equal(g.edges.length, 0)
    assert.equal(g.withoutParties, 1)
  })
})

describe('helpers', () => {
  it('graphStats splits late from due soon and ignores closed rows', () => {
    const stats = graphStats([
      dep({ id: 'a', late: true }),
      dep({ id: 'b', dueSoon: true }),
      dep({ id: 'c', status: 'DONE', open: false }),
    ])
    assert.deepEqual(stats, { dependencies: 3, late: 1, dueSoon: 1, open: 2, closed: 1 })
  })

  it('findPersonInDependencies reads the subject from the rows', () => {
    const rows = [dep({ id: 'a', providers: [person('p1', 'Abebe')], needers: [person('me', 'Meklit')] })]
    assert.equal(findPersonInDependencies('me', rows)?.name, 'Meklit')
    assert.equal(findPersonInDependencies('nobody', rows), null)
  })
})
