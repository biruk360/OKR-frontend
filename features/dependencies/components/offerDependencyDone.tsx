'use client'

import toast from 'react-hot-toast'
import { dependenciesApi } from '../services/api'
import { dependencyOfferLabel, pickDependencyToOfferDone } from '../services/delivery-todo-offer'

/**
 * DEP-4: after a Todo is marked COMPLETED, look up a dependency delivered by it
 * (`deliveryTodoId`). If one is still open and the viewer may change its status,
 * show an action toast "Mark DEPxx done?" that sets it DONE.
 *
 * Fire-and-forget and silent on failure: the Todo completion has already
 * succeeded, and viewers without the package module get a 403 here.
 */
export async function offerDependencyDoneForTodo(todoId: string): Promise<void> {
  let row
  try {
    const list = await dependenciesApi.list({ deliveryTodoId: todoId })
    row = pickDependencyToOfferDone(list.dependencies, todoId)
  } catch {
    return
  }
  if (!row) return
  const dependency = row
  const label = dependencyOfferLabel(dependency)

  toast.custom(
    (t) => (
      <div
        role="status"
        className="flex items-center gap-3 rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-body-sm text-[var(--ap-fg)] shadow-[var(--ap-shadow-lg)]"
      >
        <span>
          This card delivers dependency {label}. Mark it done?
        </span>
        <button
          type="button"
          className="ap-focus-ring rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] px-2.5 py-1 text-xs font-medium text-[var(--ap-accent-fg)] hover:opacity-90"
          onClick={async () => {
            toast.dismiss(t.id)
            try {
              await dependenciesApi.setStatus(dependency.id, { status: 'DONE' })
              toast.success(`Dependency ${label} marked done`)
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not update the dependency')
            }
          }}
        >
          Mark done
        </button>
        <button
          type="button"
          className="ap-focus-ring rounded-[var(--ap-radius-sm)] px-2 py-1 text-xs font-medium text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]"
          onClick={() => toast.dismiss(t.id)}
        >
          Not now
        </button>
      </div>
    ),
    { duration: 10000, id: `dep-done-offer-${dependency.id}` },
  )
}
