import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ProjectScheduleView = 'gantt' | 'table' | 'board' | 'workload' | 'mindmap' | 'overview'

interface ProjectViewState {
  projectId: string | null
  activeView: ProjectScheduleView
  favoriteViews: ProjectScheduleView[]
  search: string
  status: string
  assignee: string
  priority: string
  risk: string
  enterProject: (projectId: string) => void
  setActiveView: (view: ProjectScheduleView) => void
  toggleFavorite: (view: ProjectScheduleView) => void
  setSearch: (search: string) => void
  setStatus: (status: string) => void
  setAssignee: (assignee: string) => void
  setPriority: (priority: string) => void
  setRisk: (risk: string) => void
  clearFilters: () => void
}

export const useProjectViewStore = create<ProjectViewState>()(
  persist(
    (set) => ({
      projectId: null,
      activeView: 'gantt',
      favoriteViews: ['gantt'],
      search: '',
      status: '',
      assignee: '',
      priority: '',
      risk: '',
      enterProject: (projectId) => set((state) => state.projectId === projectId
        ? state
        : { projectId, search: '', status: '', assignee: '', priority: '', risk: '' }),
      setActiveView: (activeView) => set({ activeView }),
      toggleFavorite: (view) => set((state) => ({
        favoriteViews: state.favoriteViews.includes(view)
          ? state.favoriteViews.filter((item) => item !== view)
          : [...state.favoriteViews, view],
      })),
      setSearch: (search) => set({ search }),
      setStatus: (status) => set({ status }),
      setAssignee: (assignee) => set({ assignee }),
      setPriority: (priority) => set({ priority }),
      setRisk: (risk) => set({ risk }),
      clearFilters: () => set({ search: '', status: '', assignee: '', priority: '', risk: '' }),
    }),
    { name: 'projects.schedule-view', version: 3 }
  )
)
