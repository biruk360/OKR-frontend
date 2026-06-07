'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Archive, Copy, FilePlus2, GitBranch, Plus } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label, Modal } from '@/components/ui'
import { useCreatePerformanceTemplate, usePerformanceTemplates, useTemplateTransition } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { RoleMappingManager } from './RoleMappingManager'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type CreateTemplateForm = { name: string; roleLabel: string }

export function TemplatesWorkspace() {
  const templates = usePerformanceTemplates()
  const create = useCreatePerformanceTemplate()
  const transitions = useTemplateTransition()
  const permissions = usePerformancePermissions()
  const canCreate = permissions.can('button.performance.template.create', 'scorecard_template', 'canCreate')
    && permissions.canDo('scorecard_template_family', 'canCreate')
  const canPublish = permissions.can('button.performance.template.publish', 'scorecard_template', 'canSubmit')
  const canFork = permissions.can('button.performance.template.fork', 'scorecard_template', 'canCreate')
    && permissions.canDo('scorecard_tier', 'canCreate')
    && permissions.canDo('scorecard_criterion', 'canCreate')
  const canArchive = permissions.can('button.performance.template.archive', 'scorecard_template', 'canDelete')
  const canMapRoles = permissions.can('button.performance.template.map-role', 'template_role_mapping', 'canWrite')
    && permissions.canDo('scorecard_template', 'canWrite')
  const [open, setOpen] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTemplateForm>({
    defaultValues: { name: '', roleLabel: '' },
  })

  const submit = handleSubmit(async (values) => {
    await create.mutateAsync(values)
    reset()
    setOpen(false)
  })

  return (
    <>
      {canCreate && <div className="mb-4 flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 size-4" /> New template</Button>
      </div>}
      <Card>
        <CardHeader><CardTitle className="text-base">Template versions</CardTitle></CardHeader>
        <CardContent>
          {templates.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading templates...</p>
          ) : (templates.data ?? []).length === 0 ? (
            <EmptyState icon={FilePlus2} title="No scorecard templates" description="Create the first role scorecard template." />
          ) : (
            <div className="divide-y divide-border">
              {(templates.data ?? []).map((template) => (
                <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/performance/templates/${template.id}`} className="text-sm font-semibold hover:underline">
                        {template.family.name}
                      </Link>
                      <PerformanceStatusBadge status={template.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version {template.version} · {template._count.tiers} tiers · {template.maxTotal} max points · {template._count.evaluations} evaluations
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canPublish && template.status === 'DRAFT' && (
                      <Button size="sm" variant="outline" onClick={() => transitions.publish.mutate(template.id)} disabled={transitions.publish.isPending}>
                        <GitBranch className="mr-1 size-3.5" /> Publish
                      </Button>
                    )}
                    {template.status === 'PUBLISHED' && (canFork || canArchive) && (
                      <>
                        {canFork && <Button size="sm" variant="outline" onClick={() => transitions.fork.mutate(template.id)}>
                          <Copy className="mr-1 size-3.5" /> Fork
                        </Button>}
                        {canArchive && <Button size="sm" variant="outline" onClick={() => transitions.archive.mutate(template.id)}>
                          <Archive className="mr-1 size-3.5" /> Archive
                        </Button>}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {canMapRoles && <div className="mt-6"><RoleMappingManager /></div>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create scorecard template"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>Create draft</Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4 py-2">
          <div>
            <Label htmlFor="template-name">Template name</Label>
            <Input id="template-name" {...register('name', { required: 'Template name is required' })} />
            {errors.name && <p className="mt-1 text-xs text-danger-600">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="role-label">Role label</Label>
            <Input id="role-label" {...register('roleLabel')} placeholder="Software Engineer" />
          </div>
        </form>
      </Modal>
    </>
  )
}
