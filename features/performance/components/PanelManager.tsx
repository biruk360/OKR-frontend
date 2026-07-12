'use client'

import { useState } from 'react'
import { Crown, UserPlus, Users, X } from 'lucide-react'
import { Button, ConfirmDialog, Label, Modal } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useUsersForSelection } from '@/hooks'
import type { EvaluationDetail, PanelMember } from '../types'
import { getErrorDetailIds, useSavePanel } from '../hooks/queries'
import { NativeSelect } from './NativeSelect'

type PanelRow = PanelMember & { name: string }

export function PanelManager({ evaluation }: { evaluation: EvaluationDetail }) {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<PanelRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [discardConfirm, setDiscardConfirm] = useState<{ evaluatorIds: string[] } | null>(null)
  const savePanel = useSavePanel(evaluation.id)
  const { users, isLoading: usersLoading } = useUsersForSelection({ enabled: open })

  const nameById = new Map(users.map((user) => [user.id, user.name ?? user.email]))
  const availableUsers = users.filter(
    (user) => user.id !== evaluation.employee.id && !panel.some((member) => member.evaluatorId === user.id),
  )
  const hasLead = panel.filter((member) => member.role === 'LEAD').length === 1

  function openModal() {
    setPanel(
      (evaluation.assignments ?? []).map((assignment) => ({
        evaluatorId: assignment.evaluatorId,
        role: assignment.role === 'LEAD' ? 'LEAD' : 'EVALUATOR',
        name: assignment.evaluator.name ?? assignment.evaluatorId,
      })),
    )
    setSelectedUserId('')
    setOpen(true)
  }

  function addEvaluator() {
    if (!selectedUserId) return
    setPanel((current) => [
      ...current,
      { evaluatorId: selectedUserId, role: current.length === 0 ? 'LEAD' : 'EVALUATOR', name: nameById.get(selectedUserId) ?? selectedUserId },
    ])
    setSelectedUserId('')
  }

  async function save(confirmDiscardSubmitted?: boolean) {
    try {
      await savePanel.mutateAsync({
        panel: panel.map(({ evaluatorId, role }) => ({ evaluatorId, role })),
        confirmDiscardSubmitted,
      })
      setDiscardConfirm(null)
      setOpen(false)
    } catch (error) {
      const evaluatorIds = getErrorDetailIds(error, 'evaluatorIds')
      if (evaluatorIds) setDiscardConfirm({ evaluatorIds })
    }
  }

  const submittedByEvaluator = new Map((evaluation.assignments ?? []).map((assignment) => [assignment.evaluatorId, assignment.status]))

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}><Users className="mr-1 size-3.5" /> Manage panel</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Manage evaluator panel"
        icon={Users}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save()} disabled={savePanel.isPending || panel.length === 0 || !hasLead}>Save panel</Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <div>
            <Label>Panel members</Label>
            {panel.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No evaluators assigned.</p>
            ) : (
              <div className="mt-1 divide-y divide-border rounded-md border border-border">
                {panel.map((member) => (
                  <div key={member.evaluatorId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.role === 'LEAD' ? 'Lead evaluator' : 'Evaluator'}
                        {submittedByEvaluator.get(member.evaluatorId) === 'SUBMITTED' && ' · submitted'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(member.role === 'LEAD' && 'text-primary')}
                        title={member.role === 'LEAD' ? 'Current lead' : 'Set as lead'}
                        disabled={member.role === 'LEAD'}
                        onClick={() => setPanel((current) => current.map((item) => ({ ...item, role: item.evaluatorId === member.evaluatorId ? 'LEAD' : 'EVALUATOR' })))}
                      >
                        <Crown className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Remove evaluator"
                        onClick={() => setPanel((current) => current.filter((item) => item.evaluatorId !== member.evaluatorId))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {panel.length > 0 && !hasLead && <p className="mt-1 text-xs text-danger-600">Exactly one lead evaluator is required.</p>}
          </div>
          <div>
            <Label>Add evaluator</Label>
            <div className="mt-1 flex gap-2">
              <NativeSelect
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                <option value="">{usersLoading ? 'Loading users...' : 'Select a user'}</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name ?? user.email}</option>
                ))}
              </NativeSelect>
              <Button variant="outline" onClick={addEvaluator} disabled={!selectedUserId}><UserPlus className="mr-1 size-3.5" /> Add</Button>
            </div>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!discardConfirm}
        onClose={() => setDiscardConfirm(null)}
        onConfirm={() => save(true)}
        title="Discard submitted scores"
        message={`${discardConfirm?.evaluatorIds.length ?? 0} removed evaluator${(discardConfirm?.evaluatorIds.length ?? 0) === 1 ? ' has' : 's have'} already submitted scores.`}
        description="Removing them permanently deletes their submitted scores for this evaluation."
        variant="warning"
        confirmLabel="Remove and discard"
        isLoading={savePanel.isPending}
        bullets={(discardConfirm?.evaluatorIds ?? []).map((id) => nameById.get(id) ?? panel.find((member) => member.evaluatorId === id)?.name ?? id)}
        bulletsTitle="Evaluators whose scores will be discarded:"
      />
    </>
  )
}
