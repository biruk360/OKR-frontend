export type MapMode = 'strategy' | 'org' | 'combined'

export interface MapFilters {
  showIndividualOkrs: boolean
  showEmptyDepartments: boolean
  showOrgOnly: boolean // hide objective nodes; show people-only org tree
}
