import { create } from 'zustand'

interface ScrumDraft {
  userId: string
  scrumDate: string
  todayPlan?: string
  yesterdayPlan?: string
  blockers?: string
  win?: string
  mood?: string
  updatedAt: number
}

interface ScrumStoreState {
  drafts: Record<string, ScrumDraft>
  yesterdayPanelCollapsed: boolean
  calendarView: 'month' | 'week' | 'day' | 'streak'
  activeFilters: Record<string, string[]>
  setDraft: (draft: Omit<ScrumDraft, 'updatedAt'>) => void
  clearDraft: (userId: string, scrumDate: string) => void
  setYesterdayPanelCollapsed: (collapsed: boolean) => void
  setCalendarView: (view: ScrumStoreState['calendarView']) => void
  setActiveFilters: (filters: Record<string, string[]>) => void
}

function draftKey(userId: string, scrumDate: string): string {
  return `${userId}:${scrumDate}`
}

export const useScrumStore = create<ScrumStoreState>((set) => ({
  drafts: {},
  yesterdayPanelCollapsed: false,
  calendarView: 'month',
  activeFilters: {},
  setDraft: (draft) => set((state) => ({
    drafts: {
      ...state.drafts,
      [draftKey(draft.userId, draft.scrumDate)]: { ...draft, updatedAt: Date.now() },
    },
  })),
  clearDraft: (userId, scrumDate) => set((state) => {
    const next = { ...state.drafts }
    delete next[draftKey(userId, scrumDate)]
    return { drafts: next }
  }),
  setYesterdayPanelCollapsed: (collapsed) => set({ yesterdayPanelCollapsed: collapsed }),
  setCalendarView: (view) => set({ calendarView: view }),
  setActiveFilters: (filters) => set({ activeFilters: filters }),
}))
