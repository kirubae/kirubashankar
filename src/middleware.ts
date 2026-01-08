import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';

// Routes that require authentication
const PROTECTED_ROUTES = ['/tools/share', '/tools/data-merge', '/tools/deep-search'];

export const onRequest = defineMiddleware(async ({ cookies, url, redirect, locals }, next) => {
  // Skip auth for prerendering (no env vars available)
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    locals.user = null;
    return next();
  }

  // Create Supabase client and attach to locals
  const supabase = createSupabaseServerClient(cookies);
  locals.supabase = supabase;

  // Get current user
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    locals.user = user;
  } catch {
    locals.user = null;
  }

  // Check if route requires auth
  const isProtected = PROTECTED_ROUTES.some((route) => url.pathname.startsWith(route));

  if (isProtected && !locals.user) {
    return redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return next();
});
