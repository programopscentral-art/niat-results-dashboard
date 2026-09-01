import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Service-role client — bypasses RLS. NEVER expose this key to the browser.
export const supa = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
