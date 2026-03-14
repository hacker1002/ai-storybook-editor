import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'Supabase');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  log.warn('init', 'missing env vars', { url: !!supabaseUrl, key: !!supabaseAnonKey });
}

/** Supabase client for DB queries (auth, CRUD). Uses VITE_SUPABASE_ANON_KEY. */
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
