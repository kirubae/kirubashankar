import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Logging out...</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
</head>
<body>
  <p>Logging out...</p>
  <script>
    (function() {
      try {
        var supabase = window.supabase.createClient('${supabaseUrl}', '${supabaseKey}');
        supabase.auth.signOut().finally(function() {
          window.location.href = '/';
        });
      } catch(e) {
        console.error('Logout error:', e);
        window.location.href = '/';
      }
    })();
  </script>
</body>
</html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
};
