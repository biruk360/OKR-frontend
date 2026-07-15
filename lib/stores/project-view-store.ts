import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ProjectScheduleView = 'gantt' | 'table' | 'board' | 'workload' | 'mindmap' | 'overview'

interface ProjectViewState {
  activeView: ProjectScheduleView
  search: string
  status: string
  setActiveView: (view: ProjectScheduleView) => void
  setSearch: (search: string) => void
  setStatus: (status: string) => void
}

export const useProjectViewStore = create<ProjectViewState>()(
  persist(
    (set) => ({
      activeView: 'gantt',
      search: '',
      status: '',
      setActiveView: (activeView) => set({ activeView }),
      setSearch: (search) => set({ search }),
      setStatus: (status) => set({ status }),
    }),
    { name: 'projects.schedule-view' }
  )
)
