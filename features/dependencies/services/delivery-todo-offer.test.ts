import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dependencyOfferLabel, pickDependencyToOfferDone } from './delivery-todo-offer'
import type { DependencyDetailRow, DependencyRow } from '../types'

const perms = { canEdit: false, canChangeStatus: true, canDrop: false, canCreateDeliveryTask: false }

function row(partial: Partial<DependencyDetailRow> & { id: string }): DependencyRow {
  return {
    detail: true,
    ref: null,
    title: partial.id,
    depType: 'OTHER',
    status: 'OPEN',
    neededByDate: null,
    timeframe: null,
    href: '',
    unblocksText: null,
    note: null,
    doneAt: null,
    decisionId: null,
    deliveryTodoId: 't1',
    isPackageLink: false,
    providers: [],
    needers: [],
    links: [],
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    permissions: perms,
    viewerIsProvider: true,
    viewerIsNeeder: false,
    late: false,
    dueSoon: false,
    ...partial,
  } as DependencyDetailRow
}

describe('DEP-4 delivery Todo completion offer', () => {
  it('offers an open dependency the viewer may change', () => {
    assert.equal(pickDependencyToOfferDone([row({ id: 'd1', status: 'IN_PROGRESS' })], 't1')?.id, 'd1')
  })
  it('skips closed, other-todo, summary and non-changeable rows', () => {
    const rows: DependencyRow[] = [
      row({ id: 'done', status: 'DONE' }),
      row({ id: 'dropped', status: 'DROPPED' }),
      row({ id: 'other', deliveryTodoId: 't2' }),
      row({ id: 'ro', permissions: { ...perms, canChangeStatus: false } }),
      { id: 's', detail: false, ref: null, title: 's', depType: 'OTHER', status: 'OPEN', neededByDate: null, timeframe: null, href: '' } as unknown as DependencyRow,
    ]
    assert.equal(pickDependencyToOfferDone(rows, 't1'), null)
  })
  it('labels by ref, falling back to the title', () => {
    assert.equal(dependencyOfferLabel({ ref: 'DEP14', title: 'x' }), 'DEP14')
    assert.equal(dependencyOfferLabel({ ref: null, title: 'Data feed' }), '“Data feed”')
  })
})
