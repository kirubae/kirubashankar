/**
 * Auth tier helper for checking user permissions
 * Works with Supabase client to determine user's tier level
 */

export type UserTier = 'free' | 'pro' | 'enterprise';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  tier: UserTier;
}

/**
 * Get user's tier from Supabase profiles table
 * Returns null if not logged in, 'free' as default if profile exists but no tier set
 */
export async function getUserTier(supabase: any): Promise<UserTier | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', session.user.id)
    .single();

  return profile?.tier || 'free';
}

/**
 * Get full user profile including tier
 */
export async function getUserProfile(supabase: any): Promise<UserProfile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, tier')
    .eq('id', session.user.id)
    .single();

  if (!profile) {
    // Profile doesn't exist yet, return basic info from session
    return {
      id: session.user.id,
      email: session.user.email || '',
      full_name: session.user.user_metadata?.full_name || null,
      avatar_url: session.user.user_metadata?.avatar_url || null,
      tier: 'free',
    };
  }

  return profile;
}

/**
 * Check if user has pro or enterprise tier (maker access)
 */
export function isPro(tier: UserTier | null): boolean {
  return tier === 'pro' || tier === 'enterprise';
}

/**
 * Get tier display name
 */
export function getTierDisplayName(tier: UserTier | null): string {
  switch (tier) {
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
    case 'free':
    default:
      return 'Free';
  }
}
