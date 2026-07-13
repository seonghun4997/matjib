// ─────────────────────────────────────────────
// 사이트 전역 설정 — 여기만 고치면 이름/기본값이 바뀝니다
// ─────────────────────────────────────────────

export const SITE_NAME = "맛집검수소";
export const SITE_TAGLINE = "기준을 통과한 맛집만 모았어요";

// 필터 기본값 (관리자 페이지에서 저장하면 Supabase 값이 우선 적용됩니다)
// - taste_pct  : 맛 관련 리뷰 비율(%).  4:1 이상 = 80%
// - revisit_pct: 최근 리뷰 중 재방문 리뷰 비율(%).  5:1 이상 = 20%
export const DEFAULT_FILTERS = {
  min_kakao_rating: 3.5,
  min_kakao_reviews: 30,
  min_naver_reviews: 0,
  min_taste_pct: 80,
  min_revisit_pct: 20,
};

// % → "N:1" 표기 변환 (예: 80% → 4:1, 20% → 1:4 형태가 아니라 리뷰기준 5:1)
export function tastePctToRatio(pct) {
  if (pct >= 100) return "전부";
  if (pct <= 0) return "0:1";
  const other = 100 - pct;
  return `${(pct / other).toFixed(1).replace(/\.0$/, "")}:1`;
}

export function revisitPctToRatio(pct) {
  if (pct <= 0) return "없음";
  return `리뷰 ${(100 / pct).toFixed(1).replace(/\.0$/, "")}개당 1명`;
}

// Supabase 미연결 상태에서도 화면을 확인할 수 있는 샘플 데이터
export const SAMPLE_RESTAURANTS = [
  {
    id: "sample-1",
    region: "서울 마포구 연남동",
    name: "연남서식당 (샘플)",
    theme: "한식",
    category: "돼지고기구이",
    kakao_theme: "한식",
    kakao_rating: 4.2,
    kakao_reviews: 412,
    taste_pct: 86,
    naver_rating: 4.45,
    naver_reviews: 1203,
    revisit_pct: 27,
    address: "서울 마포구 동교로 000-0",
    hours: "매일 11:30 - 21:30\n브레이크타임 15:00 - 17:00\n라스트오더 20:40",
    kakao_url: "https://map.kakao.com/link/search/연남동 맛집",
    naver_url: "",
    lat: 37.5623,
    lng: 126.9256,
    crawled_at: "2026-07-14T09:00:00+09:00",
  },
  {
    id: "sample-2",
    region: "서울 마포구 연남동",
    name: "동진칼국수 (샘플)",
    theme: "한식",
    category: "칼국수, 만두",
    kakao_theme: "한식",
    kakao_rating: 3.9,
    kakao_reviews: 158,
    taste_pct: 82,
    naver_rating: 4.3,
    naver_reviews: 640,
    revisit_pct: 21,
    address: "서울 마포구 성미산로 00",
    hours: "화-일 11:00 - 20:00 (월 휴무)\n브레이크타임 없음",
    kakao_url: "https://map.kakao.com/link/search/연남동 칼국수",
    naver_url: "",
    lat: 37.5641,
    lng: 126.9233,
    crawled_at: "2026-07-14T09:00:00+09:00",
  },
  {
    id: "sample-3",
    region: "서울 성동구 성수동",
    name: "성수제면소 (샘플)",
    theme: "일식",
    category: "일식 라멘",
    kakao_theme: "일식",
    kakao_rating: 3.6,
    kakao_reviews: 44,
    taste_pct: 68,
    naver_rating: 4.1,
    naver_reviews: 210,
    revisit_pct: 12,
    address: "서울 성동구 연무장길 00",
    hours: "매일 11:00 - 21:00\n브레이크타임 15:30 - 17:00",
    kakao_url: "https://map.kakao.com/link/search/성수동 라멘",
    naver_url: "",
    lat: 37.5424,
    lng: 127.0557,
    crawled_at: "2026-07-14T09:00:00+09:00",
  },
];
