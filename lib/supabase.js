import { createClient } from "@supabase/supabase-js";

// 환경변수에 섞이기 쉬운 실수(따옴표, 공백, 끝 슬래시)를 자동 정리합니다
function clean(v) {
  return (v || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
}

export const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// 올바른 형식: https://xxxx.supabase.co
export const urlLooksValid = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(supabaseUrl);

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
export const hasSupabase = Boolean(supabaseUrl && supabaseKey);
