# 맛집검수소

카카오맵 × 네이버 플레이스 데이터를 교차 검증해서, 기준을 통과한 맛집만 장부처럼 보여주는 사이트입니다.
컨셉부동산과 같은 방식(GitHub 드래그 업로드 → Vercel 자동 배포 + Supabase)으로 운영합니다.

## 구조

크롤링 방법은 두 가지입니다.

**방법 A (기본): 관리자 페이지에서 바로** — 사이트 /admin → 크롤링 섹션 → 지역 입력 → 시작.
파이썬 설치가 필요 없고, 진행 로그가 화면에 실시간으로 뜹니다.
단, 카카오/네이버가 서버(Vercel) IP를 차단하면 실패할 수 있습니다 — 그때는 방법 B로.

**방법 B (백업): 내 컴퓨터에서 파이썬 크롤러** — 집 IP는 차단 확률이 훨씬 낮아 안정적입니다.

```
[내 컴퓨터] crawler/main.py 실행
    → 카카오맵: 지역 검색, 즐겨찾기순, 평점·리뷰수·맛키워드 비율
    → 네이버 플레이스: 카테고리·주소·영업시간(브레이크타임)·재방문 비율
    → Supabase 업로드 (+ CSV 백업)

[웹사이트] Vercel 배포
    → Supabase 데이터 표시
    → 필터(평점/리뷰수/맛비율/재방문비율)를 화면에서 슬라이더로 직접 조정
```

## 1. Supabase 준비 (5분)

1. supabase.com → 새 프로젝트 생성
2. SQL Editor → `supabase/schema.sql` 내용 전체 붙여넣고 Run
3. Settings → API 에서 아래 3개 복사
   - Project URL
   - anon public key (웹사이트용)
   - service_role key (크롤러용 — 절대 웹사이트에 넣지 마세요)

## 2. 웹사이트 배포 (컨셉부동산과 동일)

1. GitHub 새 저장소 → 이 폴더 내용물 전부 드래그 → Commit
   (`crawler/config.json`에 키를 넣었다면 GitHub에는 올리지 마세요 — 키 없는 상태로 올리면 안전)
2. Vercel → Import → 환경변수 3개 입력
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_ADMIN_PASS` (관리자 페이지 비밀번호, 기본값 matjib)
3. Deploy — 환경변수가 없어도 샘플 데이터 모드로 화면 확인은 됩니다

## 3. 크롤러 실행

```bash
cd crawler
pip install -r requirements.txt
# config.json 열어서: regions(지역), supabase url/service_key 입력
python main.py
```

끝나면 CSV 백업 파일이 생기고 Supabase에 자동 업로드 → 사이트에 바로 반영됩니다.

### config.json 에서 조정 가능한 것

| 항목 | 의미 |
|---|---|
| `regions` | 크롤링할 지역 목록 (도/시/동 자유 표기) |
| `ranking_key` | `favorite`(즐겨찾기순) 또는 `kakao_reviews` |
| `collect_filter` | 수집 단계 필터 — 평점 3.5 / 리뷰 30 / 맛비율 80%(=4:1) |
| `taste_keywords` | 맛 관련 키워드 목록 (자유롭게 추가) |
| `naver_recent_reviews` | 재방문 계산에 쓸 최근 리뷰 개수 (기본 30) |

재방문 필터(5:1 = 20%)는 기본적으로 **업로드 후 웹사이트 슬라이더**로 거릅니다.
크롤링 단계에서 아예 걸러버리고 싶으면 `apply_revisit_filter_on_upload: true`.

## 비율 환산표

- 맛 관련 키워드 비율 4:1 = 리뷰의 **80%** 가 맛 언급
- 최근 리뷰 : 재방문 5:1 = 최근 리뷰의 **20%** 가 재방문(2회 이상 방문) 리뷰

## 유지보수 메모

- 카카오/네이버가 화면·API 구조를 바꾸면 크롤러가 멈출 수 있습니다.
  → `kakao_crawler.py`, `naver_crawler.py` 맨 위 `ENDPOINTS` 블록만 고치면 됩니다.
- 요청 간격(DELAY)을 1초 밑으로 줄이면 IP가 차단될 수 있습니다.
- 두 서비스 모두 자동수집을 약관으로 제한하고 있어, 트래픽이 커지면
  카카오 로컬 API(공식) + 네이버 검색 API(공식) 병행 전환을 권합니다.
