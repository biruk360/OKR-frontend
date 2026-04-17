'use client'

import { useMemo, useState } from 'react'
import { X, Plus } from 'lucide-react'

interface UserLike {
  id: string
  name?: string | null
  email?: string | null
}

interface ContributorsPickerProps {
  users: UserLike[]
  /** Current selection — list of user ids. Controlled. */
  value: string[]
  onChange: (next: string[]) => void
  /** Excluded because they're already the owner. */
  ownerId?: string
}

/**
 * Tiny multi-select: a dropdown + chips. No external library. Good enough for
 * a handful of contributors; swap for a combobox if the user list grows large.
 */
export default function ContributorsPicker({
  users,
  value,
  onChange,
  ownerId,
}: ContributorsPickerProps) {
  const [draft, setDraft] = useState<string>('')

  const selectedSet = useMemo(() => new Set(value), [value])

  const available = useMemo(
    () => users.filter((u) => u.id !== ownerId && !selectedSet.has(u.id)),
    [users, ownerId, selectedSet],
  )

  const selectedUsers = useMemo(
    () => value.map((id) => users.find((u) => u.id === id)).filter((u): u is UserLike => Boolean(u)),
    [value, users],
  )

  const addSelected = () => {
    if (!draft) return
    if (selectedSet.has(draft) || draft === ownerId) return
    onChange([...value, draft])
    setDraft('')
  }

  const remove = (id: string) => {
    onChange(value.filter((v) => v !== id))
  }

  return (
    <div>
      {selectedUsers.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted pl-2 pr-1 py-0.5 text-xs text-muted-foreground"
            >
              {u.name || u.email || 'Unnamed'}
              <button
                type="button"
                onClick={() => remove(u.id)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                aria-label={`Remove ${u.name || u.email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="input flex-1 text-sm"
        >
          <option value="">
            {available.length === 0 ? 'No more users to add' : 'Select a teammate…'}
          </option>
          {available.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email || u.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addSelected}
          disabled={!draft}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </div>
  )
}
