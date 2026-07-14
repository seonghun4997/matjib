-- v7 업데이트: 맛 비율 정의 변경 (키워드 추정 → 카카오 공식 '맛' 태그 비율)
-- 기존 기본값 80%는 새 정의에선 비현실적이라 25%로 조정합니다.
update settings set min_taste_pct = 25 where id = 1 and min_taste_pct > 50;
