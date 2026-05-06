import { createClient } from "@supabase/supabase-js";

const envSupabase = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

const supabaseUrl = envSupabase?.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = envSupabase?.VITE_SUPABASE_ANON_KEY || "placeholder_anon_key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
