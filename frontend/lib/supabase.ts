import { createBrowserClient } from '@supabase/ssr'

/**
 * We use createBrowserClient to ensure that authentication states (cookies)
 * are shared correctly between the browser and the Next.js Middleware.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export type SupabaseUser = Awaited<
  ReturnType<typeof supabase.auth.getUser>
>["data"]["user"]
