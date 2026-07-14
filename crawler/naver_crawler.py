# -*- coding: utf-8 -*-
"""
네이버 플레이스 수집기
  1. 카카오에서 나온 업체명으로 검색 → 플레이스 ID 확보
  2. 카테고리(업체명 오른쪽 회색글씨) / 주소 / 영업시간(브레이크타임 포함) / 평점 / 리뷰 수
  3. 최근 리뷰 30개에서 "N번째 방문" 표시로 재방문 비율 계산

※ 네이버 지도 웹의 내부 API를 사용합니다. 구조가 바뀌면
   ENDPOINTS / GRAPHQL_QUERY 부분만 수정하세요.
"""
import json
import re
import time
import requests

# ── 구조가 바뀌면 여기만 수정 ─────────────────────────────
ENDPOINTS = {
    "search": "https://map.naver.com/p/api/search/allSearch",
    "place_home": "https://pcmap.place.naver.com/restaurant/{place_id}/home",
    "graphql": "https://pcmap-api.place.naver.com/graphql",
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": "https://map.naver.com/",
    "Accept": "application/json, text/plain, */*",
}

# 방문자 리뷰 조회용 GraphQL (최신순 30개, 방문 차수 포함)
GRAPHQL_QUERY = """
query getVisitorReviews($input: VisitorReviewsInput) {
  visitorReviews(input: $input) {
    items { id body visitCount created }
    total
  }
}
"""
# ─────────────────────────────────────────────────────────

DELAY = 1.5


def find_place(name: str, region: str) -> dict | None:
    """업체명 검색 → 첫 번째 플레이스의 ID와 좌표(위경도)."""
    params = {"query": f"{region.split()[-1]} {name}", "type": "all", "searchCoord": "", "boundary": ""}
    r = requests.get(ENDPOINTS["search"], params=params, headers=HEADERS, timeout=10)
    if r.status_code != 200:
        return None
    try:
        lst = r.json()["result"]["place"]["list"]
        if not lst:
            return None
        p = lst[0]
        return {
            "id": str(p["id"]),
            "lat": float(p["y"]) if p.get("y") else None,  # y = 위도
            "lng": float(p["x"]) if p.get("x") else None,  # x = 경도
        }
    except (KeyError, TypeError, IndexError, ValueError):
        return None


def fetch_place_info(place_id: str) -> dict | None:
    """플레이스 홈 HTML 안의 __APOLLO_STATE__ JSON에서 정보 추출."""
    url = ENDPOINTS["place_home"].format(place_id=place_id)
    r = requests.get(url, headers=HEADERS, timeout=10)
    if r.status_code != 200:
        return None
    m = re.search(r"window\.__APOLLO_STATE__\s*=\s*({.*?});", r.text, re.S)
    if not m:
        return None
    state = json.loads(m.group(1))

    base = None
    for k, v in state.items():
        if k.startswith(("PlaceDetailBase", "RestaurantBase")) and isinstance(v, dict):
            base = v
            break
    if not base:
        return None

    info = {
        "category": base.get("category") or "",            # 업체명 옆 회색글씨
        "address": base.get("roadAddress") or base.get("address") or "",
        "naver_rating": base.get("visitorReviewsScore"),
        "naver_reviews": _to_int(base.get("visitorReviewsTotal")),
        "hours": _extract_hours(state),
        "naver_url": f"https://pcmap.place.naver.com/restaurant/{place_id}/home",
    }
    return info


def _to_int(v):
    try:
        return int(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _extract_hours(state: dict) -> str:
    """영업시간 + 브레이크타임을 사람이 읽는 문자열로."""
    lines = []
    for v in state.values():
        if not isinstance(v, dict):
            continue
        if "newBusinessHours" in v and v["newBusinessHours"]:
            for block in v["newBusinessHours"]:
                for h in (block or {}).get("businessHours", []) or []:
                    day = h.get("day", {}).get("name") or h.get("day", "")
                    biz = h.get("businessHours", {}) or {}
                    start, end = biz.get("start", ""), biz.get("end", "")
                    line = f"{day} {start} - {end}".strip()
                    br = h.get("breakHours") or []
                    if br:
                        bt = ", ".join(f"{b.get('start','')} - {b.get('end','')}" for b in br)
                        line += f" (브레이크타임 {bt})"
                    if line.strip():
                        lines.append(line)
            break
    return "\n".join(dict.fromkeys(lines))  # 중복 제거, 순서 유지


def fetch_revisit_pct(place_id: str, recent_n: int) -> tuple[float, int]:
    """최근 리뷰 recent_n개 중 재방문(2번째 이상 방문) 리뷰 비율(%)."""
    payload = [{
        "operationName": "getVisitorReviews",
        "variables": {
            "input": {
                "businessId": place_id,
                "businessType": "restaurant",
                "size": recent_n,
                "page": 1,
                "sort": "recent",
                "includeContent": True,
            }
        },
        "query": GRAPHQL_QUERY,
    }]
    r = requests.post(ENDPOINTS["graphql"], json=payload, headers={**HEADERS, "Content-Type": "application/json"}, timeout=10)
    if r.status_code != 200:
        return 0.0, 0
    try:
        items = r.json()[0]["data"]["visitorReviews"]["items"]
    except (KeyError, TypeError, IndexError):
        return 0.0, 0
    if not items:
        return 0.0, 0
    revisit = sum(1 for it in items if (it.get("visitCount") or 1) >= 2)
    return round(revisit / len(items) * 100, 1), revisit


def enrich(row: dict, recent_n: int) -> dict:
    """카카오 단계 결과에 네이버 정보를 붙입니다."""
    place = find_place(row["name"], row["region"])
    time.sleep(DELAY)
    if not place:
        print(f"  ! [네이버] '{row['name']}' 검색 결과 없음 — 건너뜀")
        return {**row, "naver_found": False}
    pid = place["id"]

    info = fetch_place_info(pid) or {}
    time.sleep(DELAY)
    revisit_pct, revisit_cnt = fetch_revisit_pct(pid, recent_n)
    time.sleep(DELAY)

    print(f"  · [네이버] {row['name']}: {info.get('category','?')} / ★{info.get('naver_rating','?')} / 재방문 {revisit_pct}%")
    return {
        **row,
        "naver_found": True,
        "category": info.get("category") or row.get("kakao_category", ""),
        "address": info.get("address", ""),
        "hours": info.get("hours", ""),
        "naver_rating": info.get("naver_rating"),
        "naver_reviews": info.get("naver_reviews"),
        "revisit_pct": revisit_pct,
        "revisit_count": revisit_cnt,
        "naver_url": info.get("naver_url", ""),
        "lat": place["lat"] or row.get("lat"),
        "lng": place["lng"] or row.get("lng"),
    }
