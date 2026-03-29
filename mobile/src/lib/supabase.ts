import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kpsamcrxnkcjfgspyogs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_k39eKluIvdnURrwxtUCuug_kFrAjCZ8';

// We use custom JWT auth — Supabase session persistence is not needed.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
