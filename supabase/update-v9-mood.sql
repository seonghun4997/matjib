-- v9 업데이트: 분위기맛집 기준 컬럼
alter table settings add column if not exists min_mood_pct numeric default 25;
