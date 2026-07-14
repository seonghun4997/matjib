# -*- coding: utf-8 -*-
"""
네이버 보강 스크립트 (집 컴퓨터에서 실행)

웹사이트 수집은 카카오 데이터로 즉시 저장되고, 네이버 항목(평점/리뷰수/재방문)은
'미측정'으로 남습니다. 네이버가 서버(Vercel) IP를 캡차로 막기 때문인데,
집 IP는 통과하는 편이라 이 스크립트로 미측정 칸을 채웁니다.

  실행:  python naver_backfill.py
  준비:  config.json 의 supabase url / service_key 가 채워져 있어야 함
"""
import json
import time

import requests

import naver_crawler


def main():
    with open("config.json", encoding="utf-8") as fp:
        cfg = json.load(fp)
    url = cfg["supabase"]["url"].rstrip("/")
    key = cfg["supabase"]["service_key"]
    if "여기에" in url or "여기에" in key:
        print("! config.json 의 supabase url / service_key 를 먼저 채워주세요.")
        return
    H = {"apikey": key, "Authorization": f"Bearer {key}"}

    rows = requests.get(
        f"{url}/rest/v1/restaurants?naver_rating=is.null&select=id,name,region,lat,lng",
        headers=H,
        timeout=30,
    ).json()
    if not isinstance(rows, list):
        print(f"! 목록 조회 실패: {rows}")
        return
    print(f"네이버 미측정 {len(rows)}곳 — 보강 시작")

    ok = 0
    for r in rows:
        try:
            e = naver_crawler.enrich(
                {"name": r["name"], "region": r["region"], "lat": r.get("lat"), "lng": r.get("lng")},
                cfg.get("naver_recent_reviews", 30),
            )
        except Exception as ex:
            print(f"  ! {r['name']} 오류: {ex}")
            continue
        if not e.get("naver_found"):
            print(f"  - {r['name']}: 네이버에서 못 찾음")
            continue
        patch = {
            k: e.get(k)
            for k in ["category", "naver_rating", "naver_reviews", "revisit_pct", "address", "hours", "naver_url", "lat", "lng"]
            if e.get(k) not in (None, "")
        }
        res = requests.patch(
            f"{url}/rest/v1/restaurants?id=eq.{r['id']}",
            headers={**H, "Content-Type": "application/json"},
            json=patch,
            timeout=30,
        )
        if res.status_code in (200, 204):
            ok += 1
            print(f"  ✓ {r['name']}: ★{e.get('naver_rating')} · 재방문 {e.get('revisit_pct')}%")
        else:
            print(f"  ! {r['name']} 저장 실패 ({res.status_code})")
        time.sleep(1.5)

    print(f"\n완료 — {ok}/{len(rows)}곳 보강. 사이트를 새로고침하면 반영돼요.")


if __name__ == "__main__":
    main()
