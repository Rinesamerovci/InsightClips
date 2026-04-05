'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// Initialize the Authentication Context
const AuthContext = createContext<any>({})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    /**
     * 1. Initial Session Check
     * Verify if a valid session exists immediately when the application loads.
     */
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }
    getUser()

    /**
     * 2. Auth State Listener
     * Monitor real-time changes (Login, Logout, Password Recovery, etc.)
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Supabase Auth Event:", event) // Monitor this in the Browser Console (F12)
      
      const currentUser = session?.user ?? null
      setUser(currentUser)

      // Logic for successful login
      if (event === 'SIGNED_IN') {
        console.log("Login Successful! Synchronizing with Dashboard...")
        /** * We use window.location.href here to ensure a hard refresh 
         * and clear any potential Next.js route caching issues.
         */
        window.location.href = '/dashboard'
      }

      // Logic for signing out
      if (event === 'SIGNED_OUT') {
        console.log("User Signed Out! Redirecting to Portal Login...")
        router.push('/login')
      }
    })

    // Cleanup subscription on component unmount
    return () => subscription.unsubscribe()
  }, [router])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook to easily access auth state in any component
export const useAuth = () => useContext(AuthContext)