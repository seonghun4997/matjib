-- v4 업데이트: 카카오맵 테마 + 네이버 리뷰 수 필터
-- 이미 schema.sql 을 실행했던 프로젝트에서만 실행하세요. (새로 시작하면 schema.sql 하나면 충분)
alter table restaurants add column if not exists theme text;
alter table settings add column if not exists min_naver_reviews integer default 0;
update restaurants set theme = '한식' where name in ('연남서식당 (샘플)', '동진칼국수 (샘플)');
update restaurants set theme = '일식' where name = '성수제면소 (샘플)';
