import { create } from 'zustand'

interface CheckInPickerState {
  isOpen: boolean
  selectedKrId: string | null
  openPicker: () => void
  closePicker: () => void
  selectKr: (id: string) => void
  clearKr: () => void
}

export const useCheckInPickerStore = create<CheckInPickerState>((set) => ({
  isOpen: false,
  selectedKrId: null,
  openPicker: () => set({ isOpen: true }),
  closePicker: () => set({ isOpen: false }),
  selectKr: (id) => set({ isOpen: false, selectedKrId: id }),
  clearKr: () => set({ selectedKrId: null }),
}))
