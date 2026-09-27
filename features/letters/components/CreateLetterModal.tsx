'use client'

import { useEffect, useState } from 'react'
import { Modal, Button, Input, Label } from '@/components/ui'
import CustomerLookup from './CustomerLookup'
import LetterTypeSelect from './LetterTypeSelect'
import { createLetter, listLetterTemplatesApi } from '../services/lettersApi'
import { useT } from '../i18n'
import type { LetterListItem, LetterTemplateRecord } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (letter: LetterListItem) => void
}

export default function CreateLetterModal({ open, onClose, onCreated }: Props) {
  const t = useT()
  const [subject, setSubject] = useState('')
  const [letterTypeId, setLetterTypeId] = useState<string | null>(null)
  const [letterTypeCode, setLetterTypeCode] = useState<string | null>(null)
  const [templates, setTemplates] = useState<LetterTemplateRecord[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Templates for the chosen type (FR-4). Empty choice = the server default.
  useEffect(() => {
    setTemplateId('')
    if (!letterTypeCode) { setTemplates([]); return }
    let cancelled = false
    listLetterTemplatesApi({ letterType: letterTypeCode })
      .then((rows) => { if (!cancelled) setTemplates(rows) })
      .catch(() => { if (!cancelled) setTemplates([]) })
    return () => { cancelled = true }
  }, [letterTypeCode])

  function reset() {
    setSubject('')
    setLetterTypeId(null)
    setLetterTypeCode(null)
    setTemplateId('')
    setCustomerName('')
    setOdooPartnerId(null)
    setError(null)
  }

  async function handle() {
    setError(null)
    if (subject.trim().length < 3) { setError('Subject must be at least 3 characters'); return }
    if (!letterTypeId) { setError('Please choose a letter type'); return }
    setSubmitting(true)
    try {
      const letter = await createLetter({
        subject: subject.trim(),
        letterTypeId,
        templateId: templateId || null,
        customerName: customerName.trim() || undefined,
        odooPartnerId,
      })
      reset()
      onCreated(letter)
    } catch (e: any) {
      setError(e?.message || 'Could not create letter')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('create.title')} size="md">
      <div className="space-y-4 p-5">
        <Field label={t('create.subject')} htmlFor="cl-subject">
          <Input
            id="cl-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('create.subject.placeholder')}
            maxLength={255}
            className="h-10"
          />
        </Field>

        <LetterTypeSelect
          label={t('create.type')}
          value={letterTypeId}
          onChange={(id, record) => {
            setLetterTypeId(id)
            setLetterTypeCode(record.code)
          }}
        />

        {templates.length > 0 && (
          <Field label="Body template" htmlFor="cl-template">
            <select
              id="cl-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex h-10 w-full rounded-[var(--ap-radius-md)] border bg-card px-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)] focus:ring-offset-1"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <option value="">Default template for this type</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.language.toUpperCase()})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field
          label={
            <>
              {t('create.customer')}{' '}
              <span className="text-caption font-normal text-muted-foreground">
                {t('create.customer.optional')}
              </span>
            </>
          }
        >
          <CustomerLookup
            value={{ odooPartnerId, customerName }}
            onChange={(v) => {
              setOdooPartnerId(v.odooPartnerId)
              setCustomerName(v.customerName)
            }}
          />
        </Field>

        {error && (
          <div className="rounded-[var(--ap-radius-sm)] bg-danger-50 px-3 py-2 text-xs text-danger-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting} className="h-10">
            {t('create.cancel')}
          </Button>
          <Button
            onClick={handle}
            disabled={submitting || !subject.trim() || !letterTypeId}
            className="h-10"
          >
            {submitting ? t('create.submitting') : t('create.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
