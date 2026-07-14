# -*- coding: utf-8 -*-
"""
카카오맵 수집기
  1. "{지역} 맛집" 검색 → 후보 목록
  2. 즐겨찾기 수(없으면 리뷰 수) 기준 정렬
  3. 각 가게의 평점 / 리뷰 수 / 최근 리뷰 텍스트 → 맛 키워드 비율 계산

※ 카카오맵 웹이 내부적으로 쓰는 JSON 엔드포인트를 사용합니다.
   화면 개편으로 응답 구조가 바뀌면 아래 ENDPOINTS / 필드명 부분만 수정하세요.
"""
import time
import requests

# ── 구조가 바뀌면 여기만 수정 ─────────────────────────────
ENDPOINTS = {
    "search": "https://search.map.kakao.com/mapsearch/map.daum",
    # 2025~ 신형 상세 API (구형 main/v 는 폐기됨)
    "place_detail": "https://place-api.map.kakao.com/places/panel3/{place_id}",
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": "https://map.kakao.com/",
    "Accept": "application/json, text/plain, */*",
}
# ─────────────────────────────────────────────────────────

DELAY = 1.2  # 요청 간격(초) — 너무 줄이면 차단됩니다


def search_places(region: str, suffix: str, limit: int) -> list[dict]:
    """지역 키워드 검색 → 후보 가게 목록 (음식점만)."""
    out, page = [], 1
    while len(out) < limit and page <= 3:
        params = {
            "q": f"{region} {suffix}",
            "msFlag": "A",
            "sort": "0",
            "page": page,
        }
        r = requests.get(ENDPOINTS["search"], params=params, headers=HEADERS, timeout=10)
        r.raise_for_status()
        data = r.json()
        places = data.get("place", []) or []
        if not places:
            break
        for p in places:
            # 음식점 카테고리만 (FD: 음식점, CE: 카페)
            cate = p.get("cate_name_depth1", "") or p.get("category", "")
            if cate and ("음식점" not in cate and "카페" not in cate and not p.get("cate", "").startswith(("FD", "CE"))):
                continue
            out.append({
                "kakao_id": str(p.get("confirmid") or p.get("id", "")),
                "name": p.get("name", "").strip(),
                "favorite": int(p.get("favorite_cnt") or p.get("favorCnt") or 0),
                "address": p.get("new_address") or p.get("address", ""),
                "theme": extract_theme(p),
            })
        page += 1
        time.sleep(DELAY)
    return out[: limit * 2]  # 상세 조회 실패 대비 여유분


def extract_theme(p: dict) -> str:
    """카카오 분류에서 대표 테마 추출 (음식점 > 한식 > 국수 → '한식')."""
    # 검색 응답에 분류가 단계별 필드로 오는 경우
    d2 = (p.get("cate_name_depth2") or "").strip()
    if d2:
        return d2
    # "음식점 > 한식 > 국수" 형태 문자열인 경우
    chain = p.get("cate_name") or p.get("category") or ""
    parts = [x.strip() for x in str(chain).split(">") if x.strip()]
    if len(parts) >= 2:
        return parts[1]
    return parts[0] if parts else ""


def fetch_detail(place_id: str) -> dict | None:
    """가게 상세 (신형 panel3) — 평점, 리뷰 수, 카테고리, 리뷰 텍스트."""
    url = ENDPOINTS["place_detail"].format(place_id=place_id)
    headers = {
        **HEADERS,
        "pf": "web",
        "Origin": "https://place.map.kakao.com",
        "Referer": f"https://place.map.kakao.com/{place_id}",
    }
    r = requests.get(url, headers=headers, timeout=10)
    if r.status_code != 200:
        return None
    data = r.json()
    ks = (data.get("kakaomap_review") or {}).get("score_set") or {}
    if not ks:
        return None
    cnt = int(ks.get("review_count") or 0)
    avg = ks.get("average_score")
    cat = (data.get("summary") or {}).get("category") or {}
    texts = [
        (rv or {}).get("contents", "")
        for rv in (data.get("kakaomap_review") or {}).get("reviews", []) or []
        if (rv or {}).get("contents")
    ]
    return {
        "rating": round(float(avg), 2) if avg is not None else (round(ks.get("total_score", 0) / cnt, 2) if cnt else 0),
        "reviews": cnt,
        "category": cat.get("name4") or cat.get("name3") or cat.get("name") or "",
        "theme_fallback": cat.get("name2") or "",
        "texts": texts,
        "url": f"https://place.map.kakao.com/{place_id}",
    }


def taste_pct(texts: list[str], keywords: list[str]) -> float:
    """맛 키워드가 들어간 리뷰의 비율(%). 80% = 맛:기타 = 4:1"""
    if not texts:
        return 0.0
    hit = sum(1 for t in texts if any(k in t for k in keywords))
    return round(hit / len(texts) * 100, 1)


def crawl_region(region: str, cfg: dict) -> list[dict]:
    """한 지역 전체 파이프라인 → 카카오 단계 결과 목록."""
    print(f"\n[카카오] '{region}' 검색 중…")
    candidates = search_places(region, cfg["search_keyword_suffix"], cfg["max_candidates_per_region"])
    print(f"  후보 {len(candidates)}곳 발견")

    results = []
    for c in candidates:
        if not c["kakao_id"]:
            continue
        try:
            d = fetch_detail(c["kakao_id"])
        except Exception as e:
            print(f"  ! {c['name']} 상세 실패: {e}")
            continue
        if not d:
            continue

        texts = d.get("texts", [])[: cfg["kakao_review_sample"]]
        row = {
            "region": region,
            "name": c["name"],
            "theme": c.get("theme", "") or d.get("theme_fallback", ""),
            "kakao_rating": d["rating"],
            "kakao_reviews": d["reviews"],
            "taste_pct": taste_pct(texts, cfg["taste_keywords"]),
            "favorite": c["favorite"],
            "kakao_category": d["category"],
            "kakao_theme": c.get("theme") or d.get("theme") or "",
            "kakao_url": d["url"],
        }
        print(f"  · {row['name']} [{row['kakao_theme'] or '분류없음'}]: ★{row['kakao_rating']} / 리뷰 {row['kakao_reviews']} / 맛비율 {row['taste_pct']}% / ♥{row['favorite']}")
        results.append(row)
        time.sleep(DELAY)

    # 랭킹 기준 정렬 (기본: 즐겨찾기 순)
    key = cfg.get("ranking_key", "favorite")
    results.sort(key=lambda r: r.get(key, 0) or r["kakao_reviews"], reverse=True)
    return results[: cfg["max_candidates_per_region"]]
