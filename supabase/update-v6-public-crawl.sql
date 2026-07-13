-- v6 업데이트: 방문자 크롤링 작업 테이블 (여러 번 실행해도 안전)
create table if not exists crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  status text not null default 'running',
  candidates jsonb,
  created_at timestamptz default now(),
  finished_at timestamptz
);
alter table crawl_jobs enable row level security;
drop policy if exists "public read jobs" on crawl_jobs;
drop policy if exists "public insert jobs" on crawl_jobs;
drop policy if exists "public update jobs" on crawl_jobs;
create policy "public read jobs" on crawl_jobs for select using (true);
create policy "public insert jobs" on crawl_jobs for insert with check (true);
create policy "public update jobs" on crawl_jobs for update using (true);
