# -*- coding: utf-8 -*-
"""수집 결과를 Supabase restaurants 테이블에 upsert 합니다."""
import requests


def upload(rows: list[dict], supabase_url: str, service_key: str):
    if not rows:
        print("업로드할 데이터가 없습니다.")
        return
    if "여기에" in supabase_url or "여기에" in service_key:
        print("! config.json 의 supabase url / service_key 를 먼저 채워주세요.")
        print("  (Supabase → Settings → API 에서 확인)")
        return

    payload = []
    for r in rows:
        payload.append({
            "region": r["region"],
            "name": r["name"],
            "category": r.get("category", ""),
            "theme": r.get("theme", ""),
            "kakao_theme": r.get("kakao_theme", ""),
            "kakao_rating": r.get("kakao_rating"),
            "kakao_reviews": r.get("kakao_reviews"),
            "taste_pct": r.get("taste_pct"),
            "naver_rating": r.get("naver_rating"),
            "naver_reviews": r.get("naver_reviews"),
            "revisit_pct": r.get("revisit_pct"),
            "address": r.get("address", ""),
            "hours": r.get("hours", ""),
            "kakao_url": r.get("kakao_url", ""),
            "naver_url": r.get("naver_url", ""),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
        })

    res = requests.post(
        f"{supabase_url.rstrip('/')}/rest/v1/restaurants?on_conflict=region,name",
        json=payload,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        timeout=30,
    )
    if res.status_code in (200, 201, 204):
        print(f"✓ Supabase 업로드 완료: {len(payload)}곳")
    else:
        print(f"! 업로드 실패 ({res.status_code}): {res.text[:300]}")
