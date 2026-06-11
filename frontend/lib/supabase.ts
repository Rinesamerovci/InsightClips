import { createBrowserClient } from '@supabase/ssr'

/**
 * We use createBrowserClient to ensure that authentication states (cookies)
 * are shared correctly between the browser and the Next.js Middleware.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function isInvalidRefreshTokenText(value: unknown): boolean {
  const text = String(value ?? '').toLowerCase()
  return text.includes('invalid refresh token') || text.includes('refresh token not found')
}

export function clearSupabaseAuthArtifacts() {
  if (typeof window === 'undefined') {
    return
  }

  const clearMatchingStorageKeys = (storage: Storage) => {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => Boolean(key),
    )

    keys.forEach((key) => {
      const normalizedKey = key.toLowerCase()
      if (
        normalizedKey.includes('supabase.auth.token') ||
        normalizedKey.includes('sb-') ||
        normalizedKey.includes('auth-token')
      ) {
        storage.removeItem(key)
      }
    })
  }

  try {
    clearMatchingStorageKeys(window.localStorage)
    clearMatchingStorageKeys(window.sessionStorage)
  } catch {
    // Storage can be unavailable in strict browser privacy modes.
  }

  try {
    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0]?.trim()
      if (name?.startsWith('sb-')) {
        document.cookie = `${name}=; Max-Age=0; path=/`
      }
    })
  } catch {
    // Cookie cleanup is best-effort only.
  }
}

const authSafeStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null
    try {
      const value = window.localStorage.getItem(key)
      if (isInvalidRefreshTokenText(value)) {
        clearSupabaseAuthArtifacts()
        return null
      }
      return value
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Ignore storage write failures.
    }
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage remove failures.
    }
  },
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authSafeStorage,
  },
})

export type SupabaseUser = Awaited<
  ReturnType<typeof supabase.auth.getUser>
>["data"]["user"]
