-- v11 업데이트: 조작 의심도 자동 숨김 기준점
alter table settings add column if not exists suspect_hide_score numeric default 60;
