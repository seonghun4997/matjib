-- v6 업데이트: 방문자 크롤링 작업 테이블
-- 이미 schema.sql 을 실행했던 프로젝트에서만 실행하세요.
create table if not exists crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  status text not null default 'running',
  candidates jsonb,
  created_at timestamptz default now(),
  finished_at timestamptz
);
alter table crawl_jobs enable row level security;
create policy "public read jobs" on crawl_jobs for select using (true);
create policy "public insert jobs" on crawl_jobs for insert with check (true);
create policy "public update jobs" on crawl_jobs for update using (true);
