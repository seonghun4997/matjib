-- v8 업데이트: 음식/분위기 분류 + 한 줄 설명 컬럼
alter table restaurants add column if not exists mood_pct numeric;
alter table restaurants add column if not exists highlight text;
-- 맛 태그 비율 새 정의에 맞춘 기본값 (아직이라면)
update settings set min_taste_pct = 25 where id = 1 and min_taste_pct > 50;
