/**
 * Dependency graph (CON-4) — client barrel.
 *
 *   - PersonDependencyGraph({ userId, timeframeId }) — profile "Links & dependencies"
 *     Graph toggle (pass as DependenciesProfileTab's `graphSlot`).
 *   - CompanyDependencyGraph({ dependencies }) — Dependency Map page graph view.
 *   - DependencyGraphCanvas + pure layout builders for other surfaces.
 */
export { PersonDependencyGraph } from './PersonDependencyGraph'
export type { PersonDependencyGraphProps } from './PersonDependencyGraph'
export { CompanyDependencyGraph } from './CompanyDependencyGraph'
export type { CompanyDependencyGraphProps } from './CompanyDependencyGraph'
export { DependencyGraphCanvas } from './DependencyGraphCanvas'
export type { DependencyGraphCanvasProps } from './DependencyGraphCanvas'
export { DEPENDENCY_TONE_COLOR } from './nodes'
export {
  buildPersonDependencyGraph,
  buildCompanyDependencyGraph,
  dependencyEdgeTone,
  worstTone,
  graphStats,
  findPersonInDependencies,
  placeColumn,
  stackY,
  DEPENDENCY_TONE_LABELS,
  DEPENDENCY_GRAPH_NODE_TYPES,
  COMPANY_GRAPH_DEFAULT_MAX,
  PERSON_GRAPH_CENTER_ID,
  GRAPH_SIZES,
} from './graph-model'
export type {
  DependencyEdgeTone,
  GraphPerson,
  GraphDependency,
  DependencyGraphLayout,
  DependencyGraphNode,
  DependencyGraphEdge,
  DependencyGraphNodeData,
  DependencyGraphStats,
  PersonNodeData,
  DependencyNodeData,
} from './graph-model'
