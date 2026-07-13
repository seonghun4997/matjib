# -*- coding: utf-8 -*-
"""
맛집검수소 크롤러 파이프라인

  실행:  python main.py
  흐름:  카카오맵 검색 → 즐겨찾기순 정렬 → 1차 필터(평점/리뷰수/맛비율)
        → 네이버 플레이스 보강(카테고리/주소/영업시간/재방문 비율)
        → CSV 저장 + Supabase 업로드
"""
import csv
import json
from datetime import datetime

import kakao_crawler
import naver_crawler
import upload


def load_config() -> dict:
    with open("config.json", encoding="utf-8") as fp:
        return json.load(fp)


def passes_kakao_stage(row: dict, cf: dict) -> bool:
    return (
        row["kakao_rating"] >= cf["min_kakao_rating"]
        and row["kakao_reviews"] >= cf["min_kakao_reviews"]
        and row["taste_pct"] >= cf["min_taste_pct"]
    )


def main():
    cfg = load_config()
    cf = cfg["collect_filter"]
    final_rows = []

    for region in cfg["regions"]:
        # 1) 카카오 단계
        kakao_rows = kakao_crawler.crawl_region(region, cfg)
        stage1 = [r for r in kakao_rows if passes_kakao_stage(r, cf)]
        print(f"[필터] 카카오 1차 통과: {len(stage1)}/{len(kakao_rows)}곳")

        # 2) 네이버 단계
        print(f"[네이버] '{region}' 보강 중…")
        for row in stage1:
            enriched = naver_crawler.enrich(row, cfg["naver_recent_reviews"])
            if not enriched.get("naver_found"):
                continue
            if cf.get("apply_revisit_filter_on_upload") and enriched["revisit_pct"] < cf["min_revisit_pct"]:
                print(f"  - {enriched['name']}: 재방문 {enriched['revisit_pct']}% < 기준 {cf['min_revisit_pct']}% → 제외")
                continue
            final_rows.append(enriched)

    # 3) CSV 백업
    if final_rows:
        stamp = datetime.now().strftime("%Y%m%d_%H%M")
        path = f"result_{stamp}.csv"
        cols = ["region", "name", "theme", "category", "kakao_theme", "kakao_rating", "kakao_reviews", "taste_pct",
                "naver_rating", "naver_reviews", "revisit_pct", "address", "hours",
                "kakao_url", "naver_url", "lat", "lng"]
        with open(path, "w", newline="", encoding="utf-8-sig") as fp:
            w = csv.DictWriter(fp, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            w.writerows(final_rows)
        print(f"\n✓ CSV 저장: {path} ({len(final_rows)}곳)")

    # 4) Supabase 업로드
    upload.upload(final_rows, cfg["supabase"]["url"], cfg["supabase"]["service_key"])


if __name__ == "__main__":
    main()
