import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Server-side client (API routes, middleware)
export function createSupabaseServerClient(cookies: AstroCookies) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        // Get all cookies from AstroCookies
        const allCookies: { name: string; value: string }[] = [];
        // AstroCookies doesn't expose a way to get all cookies directly,
        // so we try to get known Supabase auth cookies
        const cookieNames = [
          'sb-access-token',
          'sb-refresh-token',
          `sb-${supabaseUrl?.split('//')[1]?.split('.')[0]}-auth-token`,
        ];

        for (const name of cookieNames) {
          const cookie = cookies.get(name);
          if (cookie?.value) {
            allCookies.push({ name, value: cookie.value });
          }
        }

        return allCookies;
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, {
            path: '/',
            secure: import.meta.env.PROD,
            httpOnly: true,
            sameSite: 'lax',
            ...options,
          });
        });
      },
    },
  });
}

// Browser-side client (for client-side auth)
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
