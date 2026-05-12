'use client'

import { useState } from 'react'
import { Modal, Button, Input, Label } from '@/components/ui'
import { LETTER_TYPE_LABEL, type LetterType } from '@/types'
import CustomerLookup from './CustomerLookup'
import { createLetter } from '../services/lettersApi'
import { useT } from '../i18n'
import type { LetterListItem } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (letter: LetterListItem) => void
}

const LETTER_TYPES: LetterType[] = ['COVER', 'OFFER', 'GUARANTEE']

export default function CreateLetterModal({ open, onClose, onCreated }: Props) {
  const t = useT()
  const [subject, setSubject] = useState('')
  const [letterType, setLetterType] = useState<LetterType>('COVER')
  const [customerName, setCustomerName] = useState('')
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setSubject('')
    setLetterType('COVER')
    setCustomerName('')
    setOdooPartnerId(null)
    setAddress('')
    setError(null)
  }

  async function handle() {
    setError(null)
    if (subject.trim().length < 3) {
      setError('Subject must be at least 3 characters')
      return
    }
    setSubmitting(true)
    try {
      const letter = await createLetter({
        subject: subject.trim(),
        letterType,
        customerName: customerName.trim(),
        odooPartnerId,
        recipientAddress: address || undefined,
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
      <div className="space-y-3 p-4">
        <div>
          <Label htmlFor="subject">{t('create.subject')}</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('create.subject.placeholder')}
            maxLength={255}
          />
        </div>
        <div>
          <Label>{t('create.type')}</Label>
          <div className="mt-1 flex gap-2">
            {LETTER_TYPES.map((lt) => (
              <button
                key={lt}
                type="button"
                onClick={() => setLetterType(lt)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  letterType === lt
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {LETTER_TYPE_LABEL[lt]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>{t('create.customer')} <span className="text-xs font-normal text-gray-400">{t('create.customer.optional')}</span></Label>
          <CustomerLookup
            value={{ odooPartnerId, customerName }}
            onChange={(v) => {
              setOdooPartnerId(v.odooPartnerId)
              setCustomerName(v.customerName)
              if (v.address) setAddress(v.address)
            }}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t('create.cancel')}</Button>
          <Button onClick={handle} disabled={submitting}>
            {submitting ? t('create.submitting') : t('create.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
