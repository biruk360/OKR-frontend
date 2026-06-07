'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label } from '@/components/ui'
import { useDeleteTemplateMapping, usePerformanceTemplates, useSaveTemplateMapping, useTemplateMappings } from '../hooks/queries'

export function RoleMappingManager() {
  const templates = usePerformanceTemplates()
  const mappings = useTemplateMappings()
  const save = useSaveTemplateMapping()
  const remove = useDeleteTemplateMapping()
  const families = Array.from(new Map((templates.data ?? []).map((template) => [template.family.id, template.family])).values())
  const [designationKey, setDesignationKey] = useState('')
  const [familyId, setFamilyId] = useState('')

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Role-to-template mappings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div><Label>Employee designation</Label><Input value={designationKey} onChange={(event) => setDesignationKey(event.target.value)} placeholder="Software Engineer" /></div>
          <div><Label>Template family</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={familyId} onChange={(event) => setFamilyId(event.target.value)}><option value="">Select family</option>{families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></div>
          <Button className="mt-6" disabled={!designationKey.trim() || !familyId || save.isPending} onClick={() => save.mutate({ designationKey, familyId })}>Add mapping</Button>
        </div>
        {(mappings.data ?? []).length === 0 ? <EmptyState bare title="No role mappings" description="Employees without explicit assignments are resolved through these designation mappings." /> : (
          <div className="divide-y divide-border">
            {(mappings.data ?? []).map((mapping) => (
              <div key={mapping.id} className="flex items-center justify-between gap-3 py-3">
                <div><p className="text-sm font-medium">{mapping.designationKey}</p><p className="text-xs text-muted-foreground">{mapping.family.name}{mapping.department ? ` · ${mapping.department.name}` : ' · All departments'}</p></div>
                <Button size="sm" variant="outline" onClick={() => remove.mutate(mapping.id)}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
