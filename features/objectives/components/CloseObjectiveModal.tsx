'use client'

import OkrCloseModal from '@/components/shared/OkrCloseModal'

export default function CloseObjectiveModal(props: {
  open: boolean
  onClose: () => void
  objective: any
  onInitiated?: () => void
  achievedShortcut?: boolean
}) {
  return <OkrCloseModal {...props} entity={props.objective} entityType="objective" />
}
