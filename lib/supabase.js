import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 환경변수가 없으면 null — 화면은 샘플 데이터로 동작합니다
export const supabase = url && key ? createClient(url, key) : null;
export const hasSupabase = Boolean(url && key);
