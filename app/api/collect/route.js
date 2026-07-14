// ═══════════════════════════════════════════════
//  수집 API — 어드민이 호출
//    mode=search : 동네 후보 목록
//    mode=place  : 가게 1곳 수집 → 판정 → 저장
// ═══════════════════════════════════════════════
import { searchRegion, fetchPlace, buildHighlight, detectSuspicion } from "../../../lib/kakao";
import { serverClient } from "../../../lib/supabase";
import { DEFAULTS, judge } from "../../../lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ADMIN = () => process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (body.pass !== ADMIN()) return Response.json({ error: "권한 없음" }, { status: 401 });

  try {
    if (body.mode === "search") {
      const candidates = await searchRegion(body.region);
      return Response.json({ candidates });
    }

    if (body.mode === "place") {
      const result = await collectOne(body.kakaoId, body.region, body.candidate);
      return Response.json(result);
    }

    return Response.json({ error: "알 수 없는 mode" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// 가게 1곳: 상세 → 판정 → 저장
export async function collectOne(kakaoId, region, candidate = {}) {
  const sb = serverClient();
  if (!sb) throw new Error("Supabase 환경변수가 없습니다");

  const { data: st } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
  const s = { ...DEFAULTS, ...(st || {}) };

  const p = await fetchPlace(kakaoId);
  const { pass, isFood, isMood, tier } = judge(p, s);

  const detail = {
    name: p.name || candidate.name,
    rating: p.rating,
    reviews: p.reviews,
    taste_pct: p.taste_pct,
    mood_pct: p.mood_pct,
    tag_total: p.tag_total,
    isFood,
    isMood,
    pass,
  };

  if (!pass) return { saved: false, ...detail, reason: "기준 미달" };

  const sus = detectSuspicion(p);
  const { highlight, top_menu } = buildHighlight(p, { isFood, isMood });
  const autoHide = s.suspect_enabled !== false && sus.score >= s.suspect_hide_score;

  // 기존 상태 확인 (수동 복구한 가게를 자동 숨김이 덮지 않게)
  const { data: prev } = await sb
    .from("places")
    .select("id,status,revisit_pct,verified_at")
    .eq("kakao_id", String(kakaoId))
    .maybeSingle();

  const row = {
    kakao_id: String(kakaoId),
    name: p.name || candidate.name || "",
    region,
    address: p.address || candidate.address || "",
    lat: candidate.lat ?? null,
    lng: candidate.lng ?? null,
    theme: p.theme || candidate.theme || "",
    category: p.category || candidate.category || "",
    is_food: isFood,
    is_mood: isMood,
    kakao_rating: p.rating,
    kakao_reviews: p.reviews,
    taste_count: p.taste_count,
    taste_pct: p.taste_pct,
    mood_count: p.mood_count,
    mood_pct: p.mood_pct,
    trust_tier: prev?.revisit_pct != null && Number(prev.revisit_pct) >= s.min_revisit_pct ? "naver" : "kakao",
    suspect_score: sus.score,
    suspect_reasons: sus.reasons,
    highlight,
    top_menu,
    kakao_url: p.kakao_url,
    updated_at: new Date().toISOString(),
  };

  // 상태: 수동 차단(blocked)은 유지, 그 외엔 의심도로 판단
  if (prev?.status === "blocked") row.status = "blocked";
  else row.status = autoHide ? "hidden" : "live";

  const { error } = await sb.from("places").upsert(row, { onConflict: "kakao_id" });
  if (error) throw new Error(`저장 실패: ${error.message}`);

  return {
    saved: true,
    ...detail,
    suspect_score: sus.score,
    suspect_reasons: sus.reasons,
    hidden: row.status === "hidden",
    highlight,
  };
}
