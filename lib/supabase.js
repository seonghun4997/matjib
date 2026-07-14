import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");

export const SUPABASE_URL = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_KEY = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = hasSupabase ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// 서버(API 라우트)에서 사용
export function serverClient() {
  return hasSupabase ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
}
