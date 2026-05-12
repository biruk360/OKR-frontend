'use client'

import { useState } from 'react'
import { Modal, Button, Input, Label } from '@/components/ui'
import { LETTER_TYPE_LABEL, type LetterType } from '@/types'
import CustomerLookup from './CustomerLookup'
import { createLetter } from '../services/lettersApi'
import type { LetterListItem } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (letter: LetterListItem) => void
}

const LETTER_TYPES: LetterType[] = ['COVER', 'OFFER', 'GUARANTEE']

export default function CreateLetterModal({ open, onClose, onCreated }: Props) {
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
    if (!customerName.trim()) {
      setError('Customer is required')
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
    <Modal open={open} onClose={onClose} title="New Letter" size="md">
      <div className="space-y-3 p-4">
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Offer for 2026 Cloud Hosting"
            maxLength={255}
          />
        </div>
        <div>
          <Label>Letter Type</Label>
          <div className="mt-1 flex gap-2">
            {LETTER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLetterType(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  letterType === t
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {LETTER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Customer</Label>
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
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handle} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Draft'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
