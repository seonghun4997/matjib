-- ═══════════════════════════════════════════════
--  맛집검수소 v2 — 스키마 (이 파일 하나만 실행하면 끝)
--
--  Supabase → SQL Editor → 전체 붙여넣고 Run
--  ⚠️ 기존 v1 테이블(restaurants 등)은 그대로 두고, 새 테이블을 만듭니다.
--     v1 데이터가 필요 없으면 아래 주석을 풀어 정리하세요.
-- ═══════════════════════════════════════════════

-- 기존 v1 정리 (선택)
-- drop table if exists restaurants cascade;
-- drop table if exists region_requests cascade;
-- drop table if exists crawl_jobs cascade;

drop table if exists places cascade;
drop table if exists regions cascade;
drop table if exists runs cascade;
drop table if exists settings cascade;

-- ── 1. 가게 ────────────────────────────────────
create table places (
  id uuid primary key default gen_random_uuid(),
  kakao_id text not null unique,        -- 중복 방지의 기준
  name text not null,
  region text not null,
  address text,
  lat numeric,
  lng numeric,

  theme text,                            -- 한식/일식/카페…
  category text,                         -- 닭요리/라멘…
  is_food boolean default false,         -- 🍜 음식맛집
  is_mood boolean default false,         -- ✨ 분위기맛집

  kakao_rating numeric,
  kakao_reviews integer,
  taste_count integer,                   -- '맛'을 꼽은 사람 수
  taste_pct numeric,                     -- 태그 참여자 대비 %
  mood_count integer,
  mood_pct numeric,

  revisit_count integer,                 -- 최근 20개 중 재방문 수 (수기)
  revisit_pct numeric,
  verified_at timestamptz,
  verified_by text,

  trust_tier text default 'kakao',       -- kakao | naver
  suspect_score integer default 0,       -- 조작 의심도 0~100
  suspect_reasons text[],
  status text default 'live',            -- live | hidden(자동) | blocked(수동)

  highlight text,
  top_menu text,
  kakao_url text,
  naver_url text,

  first_seen_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index places_region_idx on places (region);
create index places_status_idx on places (status);
create index places_updated_idx on places (updated_at);
create index places_revisit_idx on places (revisit_pct);

-- ── 2. 설정 (단일 행) ──────────────────────────
create table settings (
  id integer primary key default 1,
  min_rating numeric default 3.5,
  min_reviews integer default 30,
  min_taste_pct numeric default 40,      -- 태그 참여자 중 '맛' 비율
  min_mood_pct numeric default 40,
  min_revisit_pct numeric default 20,    -- 20개 중 4개
  suspect_hide_score integer default 60,
  suspect_enabled boolean default true,
  auto_refresh_days integer default 7,
  auto_budget integer default 60,
  updated_at timestamptz default now(),
  constraint settings_single check (id = 1)
);
insert into settings (id) values (1);

-- ── 3. 동네 ────────────────────────────────────
create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  request_count integer default 0,       -- 고객 요청 횟수
  status text default 'requested',       -- requested | collecting | ready
  place_count integer default 0,
  last_collected_at timestamptz,
  created_at timestamptz default now()
);
create index regions_status_idx on regions (status);

-- ── 4. 실행 이력 ───────────────────────────────
create table runs (
  id uuid primary key default gen_random_uuid(),
  kind text,                             -- auto | manual
  regions text[],
  checked integer default 0,
  saved integer default 0,
  hidden integer default 0,
  errors integer default 0,
  note text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- ── RLS ────────────────────────────────────────
alter table places enable row level security;
alter table settings enable row level security;
alter table regions enable row level security;
alter table runs enable row level security;

create policy "p_read" on places for select using (true);
create policy "p_ins" on places for insert with check (true);
create policy "p_upd" on places for update using (true);
create policy "p_del" on places for delete using (true);

create policy "s_read" on settings for select using (true);
create policy "s_upd" on settings for update using (true);
create policy "s_ins" on settings for insert with check (true);

create policy "r_read" on regions for select using (true);
create policy "r_ins" on regions for insert with check (true);
create policy "r_upd" on regions for update using (true);

create policy "run_read" on runs for select using (true);
create policy "run_ins" on runs for insert with check (true);
create policy "run_upd" on runs for update using (true);

-- ── 샘플 (배포 직후 화면 확인용, 나중에 삭제 가능) ──
insert into places (kakao_id, name, region, theme, category, is_food, is_mood,
  kakao_rating, kakao_reviews, taste_count, taste_pct, mood_count, mood_pct,
  revisit_pct, trust_tier, highlight, top_menu, lat, lng, kakao_url)
values
  ('sample-1', '쌍다리돼지불백 (샘플)', '서울 성북구 성북동', '한식', '돼지고기구이', true, false,
   4.2, 142, 29, 88, 11, 33, 25, 'naver',
   '브리켓불에 구워 불향 가득하고 양념이 과하지 않은 담백한 돼지불백', '돼지불백',
   37.5924, 126.9987, 'https://map.kakao.com/link/search/성북동 돼지불백'),
  ('sample-2', '수연산방 (샘플)', '서울 성북구 성북동', '카페', '전통찻집', false, true,
   4.4, 310, 18, 30, 52, 87, null, 'kakao',
   '한옥의 고즈넉한 정취가 좋다는 평가가 많은 곳', null,
   37.5936, 127.0021, 'https://map.kakao.com/link/search/수연산방');

insert into regions (name, status, place_count, last_collected_at)
values ('서울 성북구 성북동', 'ready', 2, now());
