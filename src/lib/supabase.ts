
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim();

export const isSupabaseConfigured = Boolean(
  url && key && !url.includes('YOUR_PROJECT')
);

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key'
);

export function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add your project URL and anon key to .env.local.'
    );
  }

  return supabase;
}
