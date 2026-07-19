# matjib 작업 대장

> 이 파일이 유일한 할 일 대장. 규칙은 CLAUDE.md "작업 대장 규칙" 참조.
> 상태: 🔲대기 / ⏸중단 / ✅완료(커밋 해시)

## ⏸ 중단
- ✅ **카톡·외부 공유 미리보기 최적화** (2026-07-19, 출고 승인 대기) — 원인: `metadataBase` 부재로 og:image가 상대경로 → 수집기가 이미지를 못 가져옴. 게다가 **공유 이미지 파일이 저장소에 아예 없었고**(`public/` 폴더 자체 없음), `twitter:card`만 `summary_large_image`로 선언돼 있어 공유 시 빈 카드가 떴다.
  수리: `app/layout.js`에 `metadataBase`(+`NEXT_PUBLIC_SITE_URL` 우선) · `openGraph.url` 추가 / `app/opengraph-image.png` 신규(1200×630, 155KB — 문구는 `lib/config.js`의 name·tagline 그대로).
  시행착오 기록: 처음엔 `next/og`(ImageResponse)로 코드 생성했으나 **윈도우 로컬 빌드에서 @vercel/og 내부 `fileURLToPath` 오류로 프리렌더 실패** → 한글 부분폰트까지 넣었으나 해결 안 됨. 다른 6개 사이트와 동일하게 **정적 PNG 1장**으로 단순화(크롬으로 1회 구움). 문구를 바꾸려면 PNG를 다시 만들어야 한다.
  **실측 검증**: `next build` 통과 / 구워진 HTML에 `og:image = https://matjib-jari3.vercel.app/opengraph-image.png` 절대주소 · width 1200 · height 630 · og:url · og:site_name · twitter 전부 확인.
  🔲 남은 것: 배포 후 카카오톡에 실제로 링크를 보내 미리보기 육안 확인 (오너 1회 클릭).

## 🔲 대기
> **현재 미결 0.** 병목 대장 4건 수리 완료.
> 새 오더가 들어오면 코드 착수 전에 여기 먼저 기록할 것.

## ✅ 완료
- ✅ 병목 대장 4건 수리 (fff7c45)
- ✅ Map 컴포넌트가 전역 Map 생성자를 가리던 문제 수정 (c454a0d)
- ✅ restaurants→places 정리 · 데드코드 제거 · env.example 추가 (79a1f36)
- ✅ 표준 키트 + Sentry 도입 (7eb64db)
