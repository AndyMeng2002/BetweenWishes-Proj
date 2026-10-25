import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

// Never ship a Supabase secret/service_role key in the frontend.
// The publishable key is designed for browsers; row-level policies protect data.
export const supabase: SupabaseClient | null =
  projectUrl && publishableKey
    ? createClient(projectUrl, publishableKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;
