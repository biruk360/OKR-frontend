'use client'

import { useState } from 'react'
import { Modal, Button, Input, Label } from '@/components/ui'
import CustomerLookup from './CustomerLookup'
import LetterTypeSelect from './LetterTypeSelect'
import { createLetter } from '../services/lettersApi'
import { useT } from '../i18n'
import type { LetterListItem } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (letter: LetterListItem) => void
}

export default function CreateLetterModal({ open, onClose, onCreated }: Props) {
  const t = useT()
  const [subject, setSubject] = useState('')
  const [letterTypeId, setLetterTypeId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setSubject('')
    setLetterTypeId(null)
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
          onChange={(id) => setLetterTypeId(id)}
        />

        <Field
          label={
            <>
              {t('create.customer')}{' '}
              <span className="text-[11px] font-normal text-muted-foreground">
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
          <div className="rounded-[10px] bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-900/20 dark:text-red-300">
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
      <Label htmlFor={htmlFor} className="text-[12px]">{label}</Label>
      {children}
    </div>
  )
}
