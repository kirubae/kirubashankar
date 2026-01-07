/// <reference path="../.astro/types.d.ts" />

import type { SupabaseClient, User } from '@supabase/supabase-js';

interface CloudflareEnv {
  FILE_SHARE_BUCKET: R2Bucket;
  FILE_SHARE_DB: D1Database;
  ASSETS: Fetcher;
}

type Runtime = import('@astrojs/cloudflare').Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {
    supabase: SupabaseClient;
    user: User | null;
  }
}
