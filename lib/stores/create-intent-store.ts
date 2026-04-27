import { create } from 'zustand'

/**
 * Cross-feature "open the create modal for X" signal, fired by Cmd-K Quick Actions
 * (and any future shortcut). Each create-button reads this and pops its existing
 * modal when the intent matches. Bumping `nonce` retriggers the same intent.
 */
export type CreateIntent = 'objective' | 'todo' | 'sprint' | null

interface CreateIntentState {
  intent: CreateIntent
  nonce: number
  request: (intent: Exclude<CreateIntent, null>) => void
  clear: () => void
}

export const useCreateIntentStore = create<CreateIntentState>((set) => ({
  intent: null,
  nonce: 0,
  request: (intent) => set((s) => ({ intent, nonce: s.nonce + 1 })),
  clear: () => set({ intent: null }),
}))
