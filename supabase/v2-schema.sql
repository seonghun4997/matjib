-- ═══════════════════════════════════════════════
--  맛집검수소 v2 — 새 스키마 (전면 재작성)
--
--  실행 방법: Supabase → SQL Editor → 전체 붙여넣고 Run
--  ⚠️ 기존 테이블을 지우고 새로 만듭니다. (기존 데이터는 아래 백업 섹션 참고)
-- ═══════════════════════════════════════════════

-- ── 백업이 필요하면 먼저 실행 (선택) ─────────────
-- create table restaurants_backup as select * from restaurants;

drop table if exists restaurants cascade;
drop table if exists region_requests cascade;
drop table if exists crawl_jobs cascade;
drop table if exists settings cascade;

-- ═══════════════════════════════════════════════
--  1. 가게
-- ═══════════════════════════════════════════════
create table places (
  id uuid primary key default gen_random_uuid(),

  -- 식별
  kakao_id text not null unique,          -- 카카오 장소 ID (중복 방지의 진짜 기준)
  name text not null,
  region text not null,                   -- 수집한 동네 (예: 서울 성북구 성북동)
  address text,
  lat numeric,
  lng numeric,

  -- 분류
  theme text,                             -- 카카오 테마 (한식/일식/카페…)
  category text,                          -- 세부 (닭요리, 라멘…)
  is_food boolean default false,          -- 🍜 음식맛집 (맛 태그 기준 통과)
  is_mood boolean default false,          -- ✨ 분위기맛집 (분위기 태그 기준 통과)

  -- 카카오 지표
  kakao_rating numeric,
  kakao_reviews integer,
  taste_count integer,                    -- '맛' 태그를 꼽은 사람 수
  taste_pct numeric,                      -- 후기 대비 비율(%)
  mood_count integer,                     -- '분위기' 태그를 꼽은 사람 수
  mood_pct numeric,

  -- 네이버 검증 (수기)
  revisit_count integer,                  -- 최근 20개 중 재방문 리뷰 수
  revisit_pct numeric,                    -- = revisit_count * 5
  verified_at timestamptz,                -- 검증 완료 시각
  verified_by text,                       -- 검증한 사람 (알바생 이름)

  -- 신뢰도
  trust_tier text default 'kakao',        -- kakao(맛집일 확률 높음) | naver(무조건 맛집 보장) | fail
  suspect_score integer default 0,        -- 조작 의심도 0~100
  suspect_reasons text[],                 -- 의심 근거 배열
  status text default 'live',             -- live | hidden(자동숨김) | blocked(수동차단)

  -- 콘텐츠
  highlight text,                         -- 한 줄 설명
  top_menu text,                          -- 대표 메뉴
  kakao_url text,
  naver_url text,

  -- 이력
  first_seen_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index places_region_idx on places (region);
create index places_status_idx on places (status);
create index places_updated_idx on places (updated_at);

-- ═══════════════════════════════════════════════
--  2. 설정 (단일 행)
-- ═══════════════════════════════════════════════
create table settings (
  id integer primary key default 1,

  -- 검수 기준 (수집·노출 공통)
  min_rating numeric default 3.5,
  min_reviews integer default 30,
  min_taste_pct numeric default 25,       -- 음식맛집 기준
  min_mood_pct numeric default 25,        -- 분위기맛집 기준
  min_revisit_pct numeric default 20,     -- '무조건 맛집 보장' 기준 (20개 중 4개)

  -- 조작 감지
  suspect_hide_score integer default 60,  -- 이 점수 이상 자동 숨김
  suspect_enabled boolean default true,

  -- 자동 갱신
  auto_refresh_days integer default 7,    -- 며칠 지난 동네를 재수집할지
  auto_budget integer default 60,         -- 자동 실행 1회당 검수할 가게 수

  updated_at timestamptz default now(),
  constraint settings_single_row check (id = 1)
);

insert into settings (id) values (1);

-- ═══════════════════════════════════════════════
--  3. 동네 (수집 상태 관리)
-- ═══════════════════════════════════════════════
create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,              -- 서울 성북구 성북동
  request_count integer default 0,        -- 고객이 요청한 횟수
  status text default 'requested',        -- requested | collecting | ready
  place_count integer default 0,
  last_collected_at timestamptz,
  created_at timestamptz default now()
);

create index regions_status_idx on regions (status);

-- ═══════════════════════════════════════════════
--  4. 실행 로그 (자동 갱신 이력 — 어드민 대시보드용)
-- ═══════════════════════════════════════════════
create table runs (
  id uuid primary key default gen_random_uuid(),
  kind text,                              -- auto | manual
  regions text[],
  checked integer default 0,
  saved integer default 0,
  hidden integer default 0,
  errors integer default 0,
  note text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- ═══════════════════════════════════════════════
--  RLS (공개 읽기 / 쓰기는 앱에서만)
-- ═══════════════════════════════════════════════
alter table places enable row level security;
alter table settings enable row level security;
alter table regions enable row level security;
alter table runs enable row level security;

create policy "read places" on places for select using (true);
create policy "write places" on places for insert with check (true);
create policy "update places" on places for update using (true);
create policy "delete places" on places for delete using (true);

create policy "read settings" on settings for select using (true);
create policy "update settings" on settings for update using (true);
create policy "insert settings" on settings for insert with check (true);

create policy "read regions" on regions for select using (true);
create policy "write regions" on regions for insert with check (true);
create policy "update regions" on regions for update using (true);

create policy "read runs" on runs for select using (true);
create policy "write runs" on runs for insert with check (true);
create policy "update runs" on runs for update using (true);
