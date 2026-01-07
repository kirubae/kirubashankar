import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  console.log('Auth callback - code:', code ? 'present' : 'missing');
  console.log('Auth callback - full URL:', requestUrl.toString());

  if (code) {
    const supabase = createSupabaseServerClient(cookies);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    console.log('Auth callback - session:', data?.session ? 'created' : 'none');
    console.log('Auth callback - user:', data?.user?.email || 'none');

    if (error) {
      console.error('Auth callback error:', error);
      return redirect('/login?error=auth_failed');
    }
  }

  // Redirect to tools - client will handle localStorage redirect
  return redirect('/tools');
};
