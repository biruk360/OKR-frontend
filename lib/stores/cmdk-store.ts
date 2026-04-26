import { create } from 'zustand'

interface CmdkState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useCmdkStore = create<CmdkState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
