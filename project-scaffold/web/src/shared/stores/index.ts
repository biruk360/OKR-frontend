// shared/stores/index.ts
// All Zustand stores. Import from here, never from individual store files.
// Example: import { useAuthStore } from '@/shared/stores'

export { useAuthStore } from './authStore';
export { useUIStore } from './uiStore';
export { useNetworkStore } from './networkStore';

// ─────────────────────────────────────────────────────────────────────────────
// shared/stores/authStore.ts (scaffold — implement fully when building auth)
// ─────────────────────────────────────────────────────────────────────────────
// import { create } from 'zustand';
// import { persist } from 'zustand/middleware';
//
// interface User { id: string; name: string; email: string; role: string; }
//
// interface AuthState {
//   user: User | null;
//   token: string | null;
//   isAuthenticated: boolean;
//   login: (token: string, user: User) => void;
//   logout: () => void;
//   setUser: (user: User) => void;
// }
//
// export const useAuthStore = create<AuthState>()(
//   persist(
//     (set) => ({
//       user: null,
//       token: null,
//       isAuthenticated: false,
//       login: (token, user) => set({ token, user, isAuthenticated: true }),
//       logout: () => set({ token: null, user: null, isAuthenticated: false }),
//       setUser: (user) => set({ user }),
//     }),
//     { name: 'auth-storage' }
//   )
// );

// ─────────────────────────────────────────────────────────────────────────────
// shared/stores/uiStore.ts (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
// interface Toast { message: string; type: 'success'|'error'|'warning'|'info'; }
//
// interface UIState {
//   isLoading: boolean;
//   toast: Toast | null;
//   setLoading: (v: boolean) => void;
//   showToast: (toast: Toast) => void;
//   clearToast: () => void;
// }
//
// export const useUIStore = create<UIState>()((set) => ({
//   isLoading: false,
//   toast: null,
//   setLoading: (v) => set({ isLoading: v }),
//   showToast: (toast) => set({ toast }),
//   clearToast: () => set({ toast: null }),
// }));
