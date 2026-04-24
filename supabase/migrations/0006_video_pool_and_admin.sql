-- 0006_video_pool_and_admin.sql
-- Phase 5: admin-curated TikTok pool + admin role

-- ────────────────────────────────────────────────────────────
-- categories: extensible lookup of TikTok-explore category names
-- ────────────────────────────────────────────────────────────
create table public.categories (
  slug text primary key,                       -- '喜剧' (TikTok chip text)
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "categories_read" on public.categories
  for select to authenticated using (true);

insert into public.categories (slug, display_order) values
  ('唱歌跳舞',  0),
  ('喜剧',      1),
  ('动画与漫画', 2),
  ('表演',      3),
  ('对口型',    4),
  ('美容护理',  5),
  ('穿搭',      6),
  ('美食',      7),
  ('动物',      8),
  ('家庭',      9),
  ('健身和健康', 10),
  ('运动',      11);

-- ────────────────────────────────────────────────────────────
-- video_pool: admin-curated videos for the feed
-- ────────────────────────────────────────────────────────────
create table public.video_pool (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  source text not null default 'tiktok'
    check (source in ('tiktok','youtube')),
  category text not null,
  title text,
  author text,
  thumbnail_url text,
  is_active boolean not null default true,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint video_pool_category_fk
    foreign key (category)
    references public.categories(slug)
    on delete restrict
    on update cascade
);

create index on public.video_pool (category) where is_active = true;
create index on public.video_pool (created_at desc);

alter table public.video_pool enable row level security;

create policy "video_pool_read_active" on public.video_pool
  for select to authenticated using (is_active = true);

-- (No insert/update/delete policy: writes only via service_role.)

-- ────────────────────────────────────────────────────────────
-- profiles.is_admin: boolean role flag
-- ────────────────────────────────────────────────────────────
alter table public.profiles
  add column is_admin boolean not null default false;

update public.profiles set is_admin = true
  where email = 'luyin.hu@epfl.ch';
