// ═══════════════════════════════════════════════
//  사이트 설정 · 공통 규칙
// ═══════════════════════════════════════════════

export const SITE = {
  name: "맛집검수소",
  tagline: "검증된 맛집만 지도에 모았어요",
  description: "카카오맵 데이터와 네이버 재방문율을 교차 검증해, 실패 없는 맛집만 골라드려요.",
};

// 기본 검수 기준 (DB settings 가 우선)
export const DEFAULTS = {
  min_rating: 3.5,
  min_reviews: 30,
  min_taste_pct: 40,      // '맛' 태그를 누른 사람 비율 (분모: 태그 누른 사람 수)
  min_mood_pct: 40,       // '분위기' 태그 비율
  min_revisit_pct: 20,    // 최근 20개 중 4개 = 20%
  suspect_hide_score: 60, // 이 점수 이상 자동 숨김
  auto_refresh_days: 7,
  auto_budget: 60,
};

// 신뢰 등급
export const TIER = {
  naver: { label: "무조건 맛집 보장", desc: "카카오 검증 + 네이버 재방문까지 통과" },
  kakao: { label: "맛집일 확률 높음", desc: "카카오 데이터 기준 통과 (재방문 검증 전)" },
};

// 검수 판정 (수집·노출 공통 규칙)
export function judge(place, s) {
  const rating = Number(place.kakao_rating ?? place.rating ?? 0);
  const reviews = Number(place.kakao_reviews ?? place.reviews ?? 0);
  const taste = Number(place.taste_pct ?? 0);
  const mood = Number(place.mood_pct ?? 0);

  const baseOk = rating >= s.min_rating && reviews >= s.min_reviews;
  const isFood = baseOk && taste >= s.min_taste_pct;
  const isMood = baseOk && mood >= s.min_mood_pct;
  const pass = isFood || isMood;

  const revisit = place.revisit_pct;
  const tier = !pass ? "fail" : revisit != null && Number(revisit) >= s.min_revisit_pct ? "naver" : "kakao";

  return { pass, isFood, isMood, tier };
}

export const SAMPLE = [
  {
    id: "s1",
    kakao_id: "0",
    region: "서울 성북구 성북동",
    name: "쌍다리돼지불백 (샘플)",
    theme: "한식",
    category: "돼지고기구이",
    kakao_rating: 4.2,
    kakao_reviews: 142,
    taste_count: 29,
    taste_pct: 88,
    mood_count: 11,
    mood_pct: 33,
    revisit_pct: 25,
    is_food: true,
    is_mood: false,
    trust_tier: "naver",
    suspect_score: 0,
    highlight: "브리켓불에 구워 불향 가득하고 양념이 과하지 않은 담백한 돼지불백",
    top_menu: "돼지불백",
    lat: 37.5924,
    lng: 126.9987,
    kakao_url: "https://map.kakao.com/link/search/성북동 맛집",
    status: "live",
  },
  {
    id: "s2",
    kakao_id: "1",
    region: "서울 성북구 성북동",
    name: "수연산방 (샘플)",
    theme: "카페",
    category: "전통찻집",
    kakao_rating: 4.4,
    kakao_reviews: 310,
    taste_count: 18,
    taste_pct: 30,
    mood_count: 52,
    mood_pct: 87,
    revisit_pct: null,
    is_food: false,
    is_mood: true,
    trust_tier: "kakao",
    suspect_score: 0,
    highlight: "한옥의 고즈넉한 정취가 좋다는 평가가 많은 곳",
    top_menu: null,
    lat: 37.5936,
    lng: 127.0021,
    kakao_url: "https://map.kakao.com/link/search/수연산방",
    status: "live",
  },
];
