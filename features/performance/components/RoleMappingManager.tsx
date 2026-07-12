'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Tags, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Input, Label } from '@/components/ui'
import { useDeleteTemplateMapping, usePerformanceTemplates, useSaveTemplateMapping, useTemplateMappings } from '../hooks/queries'
import { NativeSelect } from './NativeSelect'
import { SectionCard } from './SectionCard'

type MappingForm = { designationKey: string; familyId: string }

export function RoleMappingManager() {
  const templates = usePerformanceTemplates()
  const mappings = useTemplateMappings()
  const save = useSaveTemplateMapping()
  const remove = useDeleteTemplateMapping()
  const families = Array.from(new Map((templates.data ?? []).map((template) => [template.family.id, template.family])).values())
  const { register, handleSubmit, watch } = useForm<MappingForm>({ defaultValues: { designationKey: '', familyId: '' } })
  const values = watch()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; designationKey: string; familyName: string } | null>(null)

  const submit = handleSubmit((form) => {
    save.mutate({ designationKey: form.designationKey, familyId: form.familyId })
  })

  async function confirmDelete() {
    if (!deleteTarget) return
    await remove.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <>
      <SectionCard title="Role-to-template mappings" contentClassName="space-y-4 px-4 py-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label>Employee designation</Label>
            <Input {...register('designationKey')} placeholder="Software Engineer" />
          </div>
          <div>
            <Label>Template family</Label>
            <NativeSelect {...register('familyId')}>
              <option value="">Select family</option>
              {families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
            </NativeSelect>
          </div>
          <Button type="submit" className="mt-6" disabled={!values.designationKey?.trim() || !values.familyId || save.isPending}>Add mapping</Button>
        </form>
        {(mappings.data ?? []).length === 0 ? (
          <EmptyState bare icon={Tags} title="No role mappings" description="Employees without explicit assignments are resolved through these designation mappings." />
        ) : (
          <div className="divide-y divide-border">
            {(mappings.data ?? []).map((mapping) => (
              <div key={mapping.id} className="flex items-center justify-between gap-3 py-3">
                <div><p className="text-sm font-medium">{mapping.designationKey}</p><p className="text-xs text-muted-foreground">{mapping.family.name}{mapping.department ? ` · ${mapping.department.name}` : ' · All departments'}</p></div>
                <Button size="sm" variant="outline" aria-label="Delete mapping" onClick={() => setDeleteTarget({ id: mapping.id, designationKey: mapping.designationKey, familyName: mapping.family.name })}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete role mapping"
        message={`Delete the mapping from "${deleteTarget?.designationKey ?? ''}" to ${deleteTarget?.familyName ?? ''}?`}
        description="Employees with this designation will no longer resolve to this template family."
        variant="danger"
        confirmLabel="Delete mapping"
        isLoading={remove.isPending}
      />
    </>
  )
}
