import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';

// Routes that require authentication
// Note: Auth is now handled client-side to avoid cookie sync issues
const PROTECTED_ROUTES: string[] = [];

export const onRequest = defineMiddleware(async ({ cookies, url, redirect, locals, request }, next) => {
  // Skip auth for prerendering (no env vars available)
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    locals.user = null;
    return next();
  }

  // Debug: log all cookies from request header
  const cookieHeader = request.headers.get('cookie') || '';
  console.log('[Middleware] Path:', url.pathname, 'Cookies:', cookieHeader.substring(0, 200));

  // Create Supabase client and attach to locals
  const supabase = createSupabaseServerClient(cookies);
  locals.supabase = supabase;

  // Get current user
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    locals.user = user;
    console.log('[Middleware] User:', user?.email || 'none');
  } catch (e) {
    console.log('[Middleware] Auth error:', e);
    locals.user = null;
  }

  // Check if route requires auth
  const isProtected = PROTECTED_ROUTES.some((route) => url.pathname.startsWith(route));

  if (isProtected && !locals.user) {
    console.log('[Middleware] Redirecting to login');
    return redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return next();
});
