// ─────────────────────────────────────────────
// 진단 전용 API (/api/lab)
// 카카오가 실제로 주는 데이터를 있는 그대로 확인합니다.
// 재개발 전 의심도 로직의 재료를 확정하기 위한 도구.
// ─────────────────────────────────────────────
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const SEARCH = "https://search.map.kakao.com/mapsearch/map.daum";
const PANEL = (id) => `https://place-api.map.kakao.com/places/panel3/${id}`;

const H = (id) => ({
  "User-Agent": UA,
  Accept: "application/json",
  pf: "web",
  Origin: "https://place.map.kakao.com",
  Referer: id ? `https://place.map.kakao.com/${id}` : "https://map.kakao.com/",
});

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (body.pass !== (process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib")) {
    return Response.json({ error: "권한 없음" }, { status: 401 });
  }

  try {
    // 1) 가게 ID 확보 — 이름으로 검색하거나 직접 입력
    let id = String(body.placeId || "").trim();
    let searched = null;
    if (!id) {
      const q = body.query || "성북동 쌍다리돼지불백";
      const r = await fetch(`${SEARCH}?q=${encodeURIComponent(q)}&msFlag=A&sort=0&page=1`, { headers: H() });
      if (!r.ok) return Response.json({ error: `카카오 검색 실패 (${r.status})` }, { status: 502 });
      const j = await r.json();
      const first = (j.place || [])[0];
      if (!first) return Response.json({ error: "검색 결과 없음" }, { status: 404 });
      id = String(first.confirmid || first.id);
      searched = { name: first.name, reviewCount: first.reviewCount, cate: first.cate_name_depth2 };
    }

    // 2) 상세(panel3) 원본
    const pr = await fetch(PANEL(id), { headers: H(id) });
    if (!pr.ok) return Response.json({ error: `상세 실패 (${pr.status})`, place_id: id }, { status: 502 });
    const data = await pr.json();

    const kr = data?.kakaomap_review || {};

    // 3) 의심도 계산에 필요한 재료를 있는 그대로 노출
    const out = {
      place_id: id,
      searched,

      // ★ 태그(맛/분위기) 카운트의 실제 구조
      score_set: kr.score_set ?? null,
      strength_description: kr.strength_description ?? null,

      // ★ 리뷰 항목의 실제 필드 (등록일 형식, 별점 필드명 등)
      review_fields: Object.keys((kr.reviews || [])[0] || {}),
      review_samples: (kr.reviews || []).slice(0, 5).map((rv) => ({
        star_rating: rv?.star_rating ?? null,
        registered_at: rv?.registered_at ?? null,
        updated_at: rv?.updated_at ?? null,
        meta_keys: rv?.meta ? Object.keys(rv.meta) : null,
        meta: rv?.meta ?? null,
      })),
      review_count_in_response: (kr.reviews || []).length,

      // ★ 리뷰어 프로필(작성자 신뢰도) 확보 가능 여부
      photo_owner_samples: (data?.photos?.photos || [])
        .slice(0, 8)
        .map((ph) => ph?.kakaomap_review_photo_meta?.owner ?? null)
        .filter(Boolean),
      photo_meta_keys: Object.keys((data?.photos?.photos || [])[0]?.kakaomap_review_photo_meta || {}),

      // ★ 메뉴(대표메뉴 추출용)
      menu_items_sample: (data?.menu?.menus?.items || []).slice(0, 3),

      // ★ 영업시간 구조 (참고용)
      open_hours_keys: Object.keys(data?.open_hours || {}),

      // 최상위 키 전체 (놓친 데이터 확인용)
      top_level_keys: Object.keys(data || {}),
    };

    return Response.json(out);
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
