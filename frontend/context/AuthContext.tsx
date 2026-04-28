'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'

import {
  clearBackendToken,
  getStoredBackendToken,
  postJson,
  storeBackendToken,
} from '@/lib/api'
import { supabase, type SupabaseUser } from '@/lib/supabase'

type BackendAuthResponse = {
  access_token: string
  expires_at: string
  token_type: 'bearer'
  user: {
    id: string
    email: string
    free_trial_used: boolean
    created_at: string | null
  }
}

type AuthContextValue = {
  user: SupabaseUser | null
  loading: boolean
  backendToken: string | null
  syncBackendSession: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [backendToken, setBackendToken] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getStoredBackendToken(),
  )
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const syncBackendSession = async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      clearBackendToken()
      setBackendToken(null)
      return null
    }

    const cachedToken = getStoredBackendToken()
    let verified: BackendAuthResponse

    try {
      verified = await postJson<BackendAuthResponse>('/auth/verify', {
        supabase_token: session.access_token,
      })
    } catch (error) {
      if (cachedToken) {
        setBackendToken(cachedToken)
        return cachedToken
      }
      throw error
    }

    storeBackendToken(verified.access_token)
    setBackendToken(verified.access_token)
    return verified.access_token
  }

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut()
    clearBackendToken()
    setBackendToken(null)
    setUser(null)
    router.replace('/login')
  }

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!active) {
        return
      }

      setUser(session?.user ?? null)
      setBackendToken(getStoredBackendToken())

      if (session?.access_token) {
        try {
          await syncBackendSession()
        } catch {
          const cachedToken = getStoredBackendToken()
          if (cachedToken) {
            setBackendToken(cachedToken)
          } else {
            clearBackendToken()
            setBackendToken(null)
          }
        }
      }

      if (active) {
        setLoading(false)
      }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)

      if (!session) {
        clearBackendToken()
        setBackendToken(null)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, backendToken, syncBackendSession, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
