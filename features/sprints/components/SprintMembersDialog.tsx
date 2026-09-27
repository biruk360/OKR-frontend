'use client'

/**
 * SprintMembersDialog — who can see this board (invite-only sprints, 2026-09-25).
 *
 * Lists the owner and the participants from GET /api/sprints/[id]/participants.
 * When the API says the viewer may manage them (`canEditSprint`: owner, ADMIN,
 * EXECUTIVE, invited department lead) it offers "Add people" (FilterMultiSelect
 * over `useUsersForSelection`) and a Remove action per person. Removing someone
 * takes away board access only — their cards are untouched, and putting them on
 * a card again re-invites them. Everyone else sees the list read-only.
 */

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserMinus, UserPlus, Users } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/Skeleton'
import { FilterMultiSelect, type FilterMultiSelectOption } from '@/components/ui/FilterMultiSelect'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { useUsersForSelection } from '@/hooks'

interface Person { id: string; name: string; avatar: string | null; email?: string }
interface MembersData {
  owner: Person
  participants: (Person & { role: string })[]
  canManage: boolean
}

interface Props {
  sprintId: string
  open: boolean
  onClose: () => void
  /** Called after an invite/removal so the board can refresh its people. */
  onChanged?: () => void
}

export default function SprintMembersDialog({ sprintId, open, onClose, onChanged }: Props) {
  const qc = useQueryClient()
  const queryKey = ['sprint-participants', sprintId]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/sprints/${sprintId}/participants`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load members')
      return json.data as MembersData
    },
  })
  const canManage = data?.canManage === true
  const { users } = useUsersForSelection({ enabled: open && canManage })

  const [pending, setPending] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<Person | null>(null)

  const onBoard = useMemo(
    () => new Set([data?.owner.id, ...(data?.participants.map((p) => p.id) ?? [])].filter(Boolean) as string[]),
    [data],
  )
  const options: FilterMultiSelectOption[] = useMemo(
    () => users
      .filter((u) => !onBoard.has(u.id))
      .map((u) => ({ value: u.id, label: u.name || u.email, hint: u.name ? u.email : undefined })),
    [users, onBoard],
  )

  function refresh() {
    void qc.invalidateQueries({ queryKey })
    onChanged?.()
  }

  async function invite() {
    if (pending.length === 0) return
    setSaving(true)
    const failed: string[] = []
    for (const userId of pending) {
      const res = await fetch(`/api/sprints/${sprintId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }).catch(() => null)
      if (!res?.ok) failed.push(userId)
    }
    setSaving(false)
    setPending(failed)
    if (failed.length === 0) toast.success(pending.length === 1 ? 'Invited to the board' : `Invited ${pending.length} people`)
    else toast.error(`Could not invite ${failed.length} ${failed.length === 1 ? 'person' : 'people'}`)
    refresh()
  }

  async function confirmRemove() {
    if (!removing) return
    const res = await fetch(`/api/sprints/${sprintId}/participants?userId=${encodeURIComponent(removing.id)}`, {
      method: 'DELETE',
    }).catch(() => null)
    const json = await res?.json().catch(() => null)
    if (!res?.ok || !json?.success) toast.error(json?.error || 'Could not remove this person')
    else toast.success(`${removing.name} no longer has access to this board`)
    setRemoving(null)
    refresh()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Board members" icon={Users} size="md">
        <p className="text-body-sm text-muted-foreground">
          This board is invite-only. Admins and executives can always open it; everyone else needs to be
          invited — being put on a card invites them automatically.
        </p>

        {canManage && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <FilterMultiSelect
              label="Add people"
              ariaLabel="Choose people to invite to this board"
              placeholder="Choose…"
              values={pending}
              onValuesChange={setPending}
              options={options}
              emptyLabel="Everyone is already on this board"
              menuWidth={300}
            />
            <Button size="sm" onClick={() => void invite()} disabled={pending.length === 0 || saving}>
              <UserPlus className="h-3.5 w-3.5" />
              {saving ? 'Inviting…' : 'Invite'}
            </Button>
          </div>
        )}

        <div className="mt-4">
          {isLoading && (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          )}
          {isError && <p className="text-body-sm text-danger-600">Could not load this board&apos;s members.</p>}
          {data && (
            <ul className="divide-y divide-border" aria-label="Board members">
              <MemberRow person={data.owner} detail="Owner" />
              {data.participants.map((p) => (
                <MemberRow
                  key={p.id}
                  person={p}
                  detail="Member"
                  onRemove={canManage ? () => setRemoving(p) : undefined}
                />
              ))}
            </ul>
          )}
          {data && data.participants.length === 0 && (
            <p className="mt-2 text-body-sm text-muted-foreground">Nobody else has been invited yet.</p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="Remove from board?"
        message={removing ? `${removing.name} will no longer be able to open this board.` : ''}
        description="Their cards are not changed. Putting them on a card again invites them back."
        variant="warning"
        confirmLabel="Remove"
      />
    </>
  )
}

function MemberRow({ person, detail, onRemove }: { person: Person; detail: string; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <UserAvatar user={person} size={28} tooltip={false} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-medium">{person.name}</div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {detail}{person.email ? ` · ${person.email}` : ''}
        </div>
      </div>
      {onRemove && (
        <Button size="xs" variant="ghost" onClick={onRemove} aria-label={`Remove ${person.name} from this board`}>
          <UserMinus className="h-3.5 w-3.5" />
          Remove
        </Button>
      )}
    </li>
  )
}
