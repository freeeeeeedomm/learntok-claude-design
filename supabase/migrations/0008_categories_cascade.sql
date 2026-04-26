-- Allow renaming a category slug. Drop and re-add the FK from
-- video_pool.category to categories(slug) with ON UPDATE CASCADE so a
-- single `update categories set slug = ?` propagates to every
-- video_pool row pointing at the old slug.

alter table public.video_pool
  drop constraint video_pool_category_fk;

alter table public.video_pool
  add constraint video_pool_category_fk
    foreign key (category)
    references public.categories(slug)
    on delete restrict
    on update cascade;
