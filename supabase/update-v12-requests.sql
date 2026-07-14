-- v12: 고객 동네 요청 테이블
create table if not exists region_requests (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  count integer default 1,
  status text default 'pending',
  created_at timestamptz default now(),
  unique (region)
);
alter table region_requests enable row level security;
drop policy if exists "public read reqs" on region_requests;
drop policy if exists "public insert reqs" on region_requests;
drop policy if exists "public update reqs" on region_requests;
create policy "public read reqs" on region_requests for select using (true);
create policy "public insert reqs" on region_requests for insert with check (true);
create policy "public update reqs" on region_requests for update using (true);
