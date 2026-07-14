// ═══════════════════════════════════════════════
//  카카오맵 데이터 수집 — 진단(/lab)으로 확정된 실제 구조 기반
//
//  확정 사실:
//   · 상세 API: place-api.map.kakao.com/places/panel3/{id}  (구형 main/v 는 폐기됨)
//   · 태그: strength_counts=[{id,count}] + strength_description=[{id,name}] 로 매핑
//   · 태그 ID: 맛=5, 분위기=3, 가성비=1, 친절=2, 주차=4
//   · 비율 분모: strength_uv (태그를 누른 사람 수) — review_count 가 아님!
//   · 리뷰마다 작성자 프로필(review_count/average_score/follower_count) 포함 → 조작 감지 재료
//   · 메뉴에 ai_mate_desc / recommend_reasons → 한 줄 설명으로 활용
// ═══════════════════════════════════════════════

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const SEARCH_URL = "https://search.map.kakao.com/mapsearch/map.daum";
const PANEL_URL = (id) => `https://place-api.map.kakao.com/places/panel3/${id}`;

const headers = (id) => ({
  "User-Agent": UA,
  Accept: "application/json",
  pf: "web",
  Origin: "https://place.map.kakao.com",
  Referer: id ? `https://place.map.kakao.com/${id}` : "https://map.kakao.com/",
});

export const TAG = { 가성비: 1, 친절: 2, 분위기: 3, 주차: 4, 맛: 5 };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 지역 검색 → 후보 전체 (페이지 끝까지) ──
export async function searchRegion(region, { maxPages = 20 } = {}) {
  const out = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(`${region} 맛집`)}&msFlag=A&sort=0&page=${page}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      if (page === 1) throw new Error(`카카오 검색 실패 (${res.status})`);
      break;
    }
    const data = await res.json();
    const places = data.place || [];
    if (!places.length) break;

    for (const p of places) {
      const id = String(p.confirmid || p.id || "");
      if (!id || seen.has(id)) continue;

      // 음식점/카페만
      const d1 = p.cate_name_depth1 || "";
      if (d1 && !d1.includes("음식점") && !d1.includes("카페")) continue;

      seen.add(id);
      out.push({
        kakao_id: id,
        name: (p.name || "").trim(),
        theme: p.cate_name_depth2 || "",        // 한식/일식/카페…
        category: p.last_cate_name || "",       // 닭요리/라멘…
        address: p.new_address || p.address || "",
        lat: p.lat != null ? Number(p.lat) : null,
        lng: p.lon != null ? Number(p.lon) : null,
        review_hint: Number(p.reviewCount || 0), // 정렬용
      });
    }
    await sleep(350);
  }
  return out;
}

// ── 가게 상세 ──
export async function fetchPlace(kakaoId) {
  const res = await fetch(PANEL_URL(kakaoId), { headers: headers(kakaoId) });
  if (!res.ok) throw new Error(`상세 실패 (${res.status})`);
  const data = await res.json();

  const kr = data?.kakaomap_review || {};
  const ss = kr.score_set || {};
  const reviews = kr.reviews || [];

  // 태그: id → 이름 매핑 후 카운트 추출
  const nameById = {};
  for (const d of kr.strength_description || []) if (d?.id != null) nameById[d.id] = d.name;
  const countById = {};
  for (const c of ss.strength_counts || []) if (c?.id != null) countById[c.id] = Number(c.count || 0);

  // ★ 분모는 strength_uv (태그를 누른 사람 수). 없으면 태그 합계로 대체
  const tagTotal =
    Number(ss.strength_uv || 0) ||
    Object.values(countById).reduce((a, b) => a + b, 0) ||
    0;

  const pct = (id) => (tagTotal ? Math.round((Number(countById[id] || 0) / tagTotal) * 1000) / 10 : null);

  const cat = data?.summary?.category || {};
  const menus = data?.menu?.menus?.items || [];

  return {
    kakao_id: String(kakaoId),
    name: data?.summary?.name || "",
    address: data?.summary?.address?.road || data?.summary?.address?.disp || "",
    theme: cat.name2 || "",
    category: cat.name4 || cat.name3 || cat.name || "",

    rating: ss.average_score != null ? Math.round(Number(ss.average_score) * 100) / 100 : null,
    reviews: Number(ss.review_count || 0),

    tag_total: tagTotal,                       // 태그를 누른 사람 수
    taste_count: Number(countById[TAG.맛] || 0),
    taste_pct: pct(TAG.맛),
    mood_count: Number(countById[TAG.분위기] || 0),
    mood_pct: pct(TAG.분위기),

    menus,
    raw_reviews: reviews,                      // 조작 감지용 (작성자 프로필 포함)
    kakao_url: `https://place.map.kakao.com/${kakaoId}`,
  };
}

// ── 한 줄 설명: 카카오 AI 문구를 우선 활용 ──
export function buildHighlight(place, { isFood, isMood }) {
  const menus = place.menus || [];
  const aiMenu = menus.find((m) => m?.ai_mate_desc) || menus.find((m) => m?.recommend_reasons?.length);
  const topMenu = (menus.find((m) => m?.is_recommend) || aiMenu || menus[0])?.name || null;

  // 1순위: 카카오 AI가 쓴 메뉴 설명 (가장 구체적이고 자연스러움)
  if (isFood && aiMenu?.ai_mate_desc) {
    return { highlight: String(aiMenu.ai_mate_desc).slice(0, 80), top_menu: topMenu };
  }
  // 2순위: 추천 이유 키워드
  if (isFood && aiMenu?.recommend_reasons?.length) {
    return { highlight: aiMenu.recommend_reasons.slice(0, 2).join(" · "), top_menu: topMenu };
  }
  // 3순위: 태그 통계 기반 문구
  const parts = [];
  if (topMenu && isFood) parts.push(`대표메뉴 ${topMenu}`);
  if (isFood && isMood) parts.push("맛과 분위기 모두 좋다는 평가");
  else if (isFood) parts.push("맛에 대한 호평이 많은 곳");
  else if (isMood) parts.push("분위기가 좋다는 평가가 많은 곳");
  return { highlight: parts.join(" · ") || null, top_menu: topMenu };
}

// ── 조작 의심도 (0~100) ──
// 재료: 리뷰 작성자 프로필 + 등록 시각 + 태그 편중
export function detectSuspicion(place) {
  const reasons = [];
  let score = 0;
  const reviews = place.raw_reviews || [];

  // 작성자 프로필 수집 (중복 제거)
  const owners = [];
  const seenUser = new Set();
  for (const rv of reviews) {
    const o = rv?.meta?.owner;
    if (!o || seenUser.has(o.map_user_id)) continue;
    seenUser.add(o.map_user_id);
    owners.push({
      reviews: Number(o.review_count || 0),
      avg: Number(o.average_score || 0),
      followers: Number(o.follower_count || 0),
      level: Number(o.timeline_level?.now_level || 0),
      star: Number(rv.star_rating || 0),
      at: Date.parse(String(rv.registered_at || "").replace(" ", "T")) || null,
    });
  }

  if (owners.length >= 5) {
    // ① 만점 계정 편중: 평균별점 4.9+ 리뷰어가 다수
    const perfect = owners.filter((o) => o.avg >= 4.9);
    const pPct = perfect.length / owners.length;
    if (pPct >= 0.7) {
      score += 40;
      reasons.push(`리뷰어 ${owners.length}명 중 ${perfect.length}명이 평균별점 4.9+ (${Math.round(pPct * 100)}%)`);
    } else if (pPct >= 0.5) {
      score += 25;
      reasons.push(`리뷰어 ${owners.length}명 중 ${perfect.length}명이 평균별점 4.9+`);
    }

    // ② 저활동 계정: 리뷰 5개 이하 + 팔로워 없음 + 만점
    const shallow = owners.filter((o) => o.reviews <= 5 && o.followers <= 1 && o.star >= 5);
    if (shallow.length >= 3) {
      score += 25;
      reasons.push(`신규·저활동 계정의 5점 리뷰 ${shallow.length}건`);
    }

    // ③ 시기 집중: 2주 안에 리뷰 70%+ 몰림
    const times = owners.map((o) => o.at).filter(Boolean).sort((a, b) => a - b);
    if (times.length >= 5) {
      const win = 14 * 86400 * 1000;
      let best = 0;
      for (const t0 of times) best = Math.max(best, times.filter((t) => t >= t0 && t <= t0 + win).length);
      if (best / times.length >= 0.7) {
        score += 25;
        reasons.push(`리뷰 ${times.length}건 중 ${best}건이 2주 안에 집중 등록`);
      }
    }

    // ④ 별점 획일화: 거의 전부 5점
    const stars = owners.map((o) => o.star).filter((s) => s > 0);
    if (stars.length >= 5 && stars.filter((s) => s >= 5).length / stars.length >= 0.95) {
      score += 15;
      reasons.push(`최근 리뷰가 거의 전부 5점`);
    }
  }

  // ⑤ 태그 편중: 특정 태그가 압도적 (평균 20~40% 대비)
  const top = Math.max(Number(place.taste_pct || 0), Number(place.mood_pct || 0));
  const label = Number(place.taste_pct || 0) >= Number(place.mood_pct || 0) ? "맛" : "분위기";
  if (top >= 90 && place.tag_total >= 10) {
    score += 20;
    reasons.push(`'${label}' 태그 비율 ${top}%로 극단적 편중`);
  }

  // ⑥ 표본 부족 대비: 리뷰 많은데 평점 4.9+
  if (Number(place.rating) >= 4.9 && Number(place.reviews) >= 50) {
    score += 15;
    reasons.push(`리뷰 ${place.reviews}개인데 평점 ${place.rating} (만점 편중)`);
  }

  return { score: Math.min(100, score), reasons };
}
