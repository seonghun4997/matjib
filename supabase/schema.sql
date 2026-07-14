-- ─────────────────────────────────────────────
-- 맛집검수소 스키마
-- Supabase → SQL Editor 에 붙여넣고 Run 하세요
-- ─────────────────────────────────────────────

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  region text not null,              -- 크롤링 지역 (예: 서울 마포구 연남동)
  name text not null,                -- 맛집 이름
  category text,                     -- 식당 주제 (네이버 회색글씨)
  theme text,                        -- 카카오맵 테마 (한식/일식/중식/양식/카페 등)
  kakao_theme text,                  -- 카카오맵 분류 테마 (한식/일식/카페 등)
  kakao_rating numeric,              -- 카카오 평점
  kakao_reviews integer,             -- 카카오 리뷰 수
  taste_pct numeric,                 -- 카카오 '맛' 태그 비율 % (후기 대비)
  mood_pct numeric,                  -- 카카오 '분위기' 태그 비율 % (음식/분위기 맛집 분류용)
  highlight text,                    -- 한 줄 설명 (수집 시 자동 생성)
  suspect_score integer default 0,   -- 후기조작 의심 신호 개수 (어드민 전용)
  suspect_reasons text,              -- 의심 근거
  hidden boolean default false,      -- 어드민이 숨긴 가게 (고객 화면 제외)
  naver_rating numeric,              -- 네이버 플레이스 평점
  naver_reviews integer,             -- 네이버 플레이스 리뷰 수
  revisit_pct numeric,               -- 최근 리뷰 중 재방문 비율 % (20% = 5:1)
  address text,                      -- 주소
  hours text,                        -- 영업시간 (브레이크타임 포함, 줄바꿈 허용)
  lat numeric,                       -- 위도 (지도 표시용)
  lng numeric,                       -- 경도
  kakao_url text,
  naver_url text,
  crawled_at timestamptz default now(),
  unique (region, name)              -- 같은 지역·같은 이름은 덮어쓰기(upsert)
);

create table if not exists settings (
  id integer primary key,
  min_kakao_rating numeric default 3.5,
  min_kakao_reviews integer default 30,
  min_naver_reviews integer default 0,
  min_taste_pct numeric default 25,
  min_mood_pct numeric default 25,
  min_revisit_pct numeric default 20,
  suspect_hide_score numeric default 60
);

insert into settings (id) values (1) on conflict (id) do nothing;

-- 고객이 요청한 동네 (어드민이 일괄 수집)
create table if not exists region_requests (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  count integer default 1,           -- 몇 명이 요청했는지
  status text default 'pending',     -- pending | done
  created_at timestamptz default now(),
  unique (region)
);
alter table region_requests enable row level security;
create policy "public read reqs" on region_requests for select using (true);
create policy "public insert reqs" on region_requests for insert with check (true);
create policy "public update reqs" on region_requests for update using (true);

-- 방문자 크롤링 작업 기록 (쿨다운/동시실행/일일상한 판정용)
create table if not exists crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  status text not null default 'running',   -- running | done
  candidates jsonb,
  created_at timestamptz default now(),
  finished_at timestamptz
);
alter table crawl_jobs enable row level security;
create policy "public read jobs" on crawl_jobs for select using (true);
create policy "public insert jobs" on crawl_jobs for insert with check (true);
create policy "public update jobs" on crawl_jobs for update using (true);

-- RLS: 누구나 읽기, 쓰기도 공개 (간단 운영용 — 트래픽 커지면 service_role 전용으로 좁히세요)
alter table restaurants enable row level security;
alter table settings enable row level security;

create policy "public read restaurants" on restaurants for select using (true);
create policy "public write restaurants" on restaurants for insert with check (true);
create policy "public update restaurants" on restaurants for update using (true);
create policy "public delete restaurants" on restaurants for delete using (true);

create policy "public read settings" on settings for select using (true);
create policy "public update settings" on settings for update using (true);
create policy "public insert settings" on settings for insert with check (true);

-- 샘플 데이터 (배포 직후 화면 확인용 — 관리자 페이지에서 삭제 가능)
insert into restaurants (region, name, theme, category, kakao_theme, kakao_rating, kakao_reviews, taste_pct, naver_rating, naver_reviews, revisit_pct, address, hours, lat, lng, kakao_url)
values
  ('서울 마포구 연남동', '연남서식당 (샘플)', '한식', '돼지고기구이', '한식', 4.2, 412, 86, 4.45, 1203, 27,
   '서울 마포구 동교로 000-0', E'매일 11:30 - 21:30\n브레이크타임 15:00 - 17:00\n라스트오더 20:40',
   37.5623, 126.9256, 'https://map.kakao.com/link/search/연남동 맛집'),
  ('서울 마포구 연남동', '동진칼국수 (샘플)', '한식', '칼국수, 만두', '한식', 3.9, 158, 82, 4.3, 640, 21,
   '서울 마포구 성미산로 00', E'화-일 11:00 - 20:00 (월 휴무)\n브레이크타임 없음',
   37.5641, 126.9233, 'https://map.kakao.com/link/search/연남동 칼국수'),
  ('서울 성동구 성수동', '성수제면소 (샘플)', '일식', '일식 라멘', '일식', 3.6, 44, 68, 4.1, 210, 12,
   '서울 성동구 연무장길 00', E'매일 11:00 - 21:00\n브레이크타임 15:30 - 17:00',
   37.5424, 127.0557, 'https://map.kakao.com/link/search/성수동 라멘')
on conflict (region, name) do nothing;
