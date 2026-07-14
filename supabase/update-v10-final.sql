-- v10 업데이트: 후기조작 의심 신호 + 숨김 기능
alter table restaurants add column if not exists suspect_score integer default 0;
alter table restaurants add column if not exists suspect_reasons text;
alter table restaurants add column if not exists hidden boolean default false;
