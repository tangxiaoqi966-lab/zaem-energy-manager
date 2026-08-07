import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserPayload, UserRole } from '../types'
import { UserRole as UserRoleEnum } from '../types'

interface RememberedCredentials {
  username: string
  password: string
}

interface AuthState {
  user: UserPayload | null
  role: UserRole | null
  token: string | null
  isAuthenticated: boolean
  remember: boolean
  remembered: RememberedCredentials | null
  setAuth: (token: string, user: UserPayload, remember: boolean, credentials?: RememberedCredentials) => void
  logout: () => void
  hasPermission: (allowedRoles: UserRole[]) => boolean
}

const SESSION_KEY = 'zaem_session_auth'

function sessionLoad(): Partial<AuthState> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Partial<AuthState>) : null
  } catch {
    return null
  }
}
function sessionSave(partial: Partial<AuthState>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(partial))
  } catch {
  }
}
function sessionClear() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      role: null,
      token: null,
      isAuthenticated: false,
      remember: false,
      remembered: null,
      setAuth: (token, user, remember, credentials) => {
        const role = user.role
        const common = { user, role, token, isAuthenticated: true, remember } as const
        if (remember) {
          set({ ...common, remembered: credentials ?? get().remembered ?? null })
          sessionClear()
        } else {
          set({ ...common, remembered: null })
          sessionSave({ user, role, token, isAuthenticated: true })
        }
      },
      logout: () => {
        sessionClear()
        set({
          user: null,
          role: null,
          token: null,
          isAuthenticated: false,
          remembered: null,
          remember: false,
        })
      },
      hasPermission: (allowedRoles) => {
        const { role } = get()
        if (!role) return false
        return allowedRoles.includes(role)
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        role: state.role,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        remembered: state.remember ? state.remembered : null,
        remember: state.remember,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return
        if (!state.remember) {
          const sess = sessionLoad()
          if (sess) {
            state.user = (sess.user ?? null) as any
            state.role = (sess.role ?? null) as any
            state.token = (sess.token ?? null) as any
            state.isAuthenticated = !!sess.isAuthenticated
          } else {
            state.user = null
            state.role = null
            state.token = null
            state.isAuthenticated = false
          }
        }
      },
    }
  )
)

export { UserRoleEnum }
