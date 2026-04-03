// frontend/context/AuthContext.tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const AuthContext = createContext({})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    // Kontrollo sesionin kur hapet faqja
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN') router.push('/dashboard')
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)