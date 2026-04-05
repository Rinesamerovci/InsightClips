import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/reset-password';

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    // Kjo pjesë bën login-in automatik nga linku
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Nëse kodi është i vjetër ose gabim
  return NextResponse.redirect(`${origin}/forgot-password?error=invalid_link`);
}