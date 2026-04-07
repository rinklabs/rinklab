// ─────────────────────────────────────────────────────────────
//  config.js  —  Supabase project credentials
//
//  Replace the two placeholder strings below with your project's
//  values from: Supabase Dashboard → Project Settings → API
// ─────────────────────────────────────────────────────────────

// Safe to commit — this is the public anon key, not the secret service_role key.
// Data is protected by Row Level Security policies, not by keeping this key secret.
const SUPABASE_URL      = 'https://kbmqmjtsirqxssgewrag.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jjMoquaberyUf0VtJQD0fg_Plo1vmaT';

// Global Supabase client used by io.js, index.html, practice.html
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
