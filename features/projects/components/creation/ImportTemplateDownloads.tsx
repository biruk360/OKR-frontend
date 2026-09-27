'use client'

import { Download, FileSpreadsheet, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImportTemplateDownloadsProps {
  context?: 'entry' | 'draft'
  onSaveExit?: () => void
}

const DOWNLOADS = [
  {
    format: 'xlsx',
    title: 'Excel workbook',
    description: 'Instructions and Schedule sheets, example rows, field guidance, filters, and a frozen header row.',
  },
  {
    format: 'csv',
    title: 'CSV file',
    description: 'A flat schedule with the same supported columns and example rows for any spreadsheet editor.',
  },
  {
    format: 'docx',
    title: 'Word work plan',
    description: 'Project overview, dates, scope, deliverables, milestones, activities, dependencies, assumptions, responsibilities, approvals and exclusions.',
  },
] as const

export function ImportTemplateDownloads({
  context = 'draft',
  onSaveExit,
}: ImportTemplateDownloadsProps) {
  return (
    <section className="rounded-card border border-border bg-surface-card p-6 shadow-card" aria-labelledby={`import-template-${context}-title`}>
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileSpreadsheet className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <h3 id={`import-template-${context}-title`} className="text-section-title text-ink-primary">
            {context === 'entry' ? 'Download a template before starting' : 'Download an import template'}
          </h3>
          <p className="mt-1 text-body text-ink-secondary">
            These files do not require an existing project or draft. Complete one in your spreadsheet or word processor and return here to import it.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DOWNLOADS.map((download) => (
          <div key={download.format} className="flex flex-col rounded-card border border-border bg-surface-muted p-4">
            <p className="text-body font-semibold text-ink-primary">{download.title}</p>
            <p className="mt-1 text-body-sm text-ink-secondary">{download.description}</p>
            <Button className="mt-4 w-full sm:w-fit" variant="outline" asChild>
              <a href={`/api/projects/creation-templates?format=${download.format}`} download>
                <Download data-icon="inline-start" /> Download {download.format.toUpperCase()}
              </a>
            </Button>
          </div>
        ))}
      </div>

      {onSaveExit && (
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <Button type="button" onClick={onSaveExit}>
            <Save data-icon="inline-start" /> Save and exit
          </Button>
        </div>
      )}
    </section>
  )
}
