-- 0013_groups_english_titles.sql
-- English-first catalog: replace Chinese group titles with English, and
-- replace emoji icons (groups + topics) with Lucide icon names so the
-- discover UI can render real vector icons instead of system emoji.
--
-- The `icon` columns stay text. Convention is now "PascalCase Lucide icon
-- name" (e.g. 'LineChart'). Existing user-created topics with emoji icons
-- continue to render — the UI's <LucideIcon> wrapper falls back to '•'
-- when the name doesn't match.
--
-- Idempotent: UPDATE-by-id is naturally re-runnable.

-- ===== Topic groups (5 preset super-categories) =====
update public.topic_groups set title = 'Finance & Economics',  icon = 'LineChart'    where id = '00000000-0000-0000-0000-0000000000a1';
update public.topic_groups set title = 'Humanities & History', icon = 'Landmark'     where id = '00000000-0000-0000-0000-0000000000a2';
update public.topic_groups set title = 'Science & Engineering',icon = 'FlaskConical' where id = '00000000-0000-0000-0000-0000000000a3';
update public.topic_groups set title = 'Mathematics',          icon = 'Sigma'        where id = '00000000-0000-0000-0000-0000000000a4';
update public.topic_groups set title = 'Computer Science',     icon = 'Code'         where id = '00000000-0000-0000-0000-0000000000a5';

-- ===== Topics (24 preset, Lucide icon names per spec Appendix A) =====
-- Finance
update public.topics set icon = 'Coins'        where id = '10be2d17-1ed0-5300-94c2-96c65e9aac6f'; -- Microeconomics
update public.topics set icon = 'Globe'        where id = '47144b1c-6c79-5143-a775-a6e656585408'; -- Macroeconomics
update public.topics set icon = 'TrendingUp'   where id = '5a7ed121-3c98-5d2e-b656-9270e87cef16'; -- Finance and Capital Markets
-- Humanities
update public.topics set icon = 'Globe2'       where id = '15e9ee0b-b157-588c-91b0-7b3ab6bc9de6'; -- World History
update public.topics set icon = 'Flag'         where id = 'd2947ac6-7537-5739-ab8c-4e29089e3c71'; -- US History
update public.topics set icon = 'Palette'      where id = '0436ea86-f4be-5bd2-9f86-97b2ca035402'; -- Art History
update public.topics set icon = 'Scale'        where id = 'ce2f7546-2bbd-5c95-ba89-e2d062098cb6'; -- US Government & Civics
-- STEM
update public.topics set icon = 'Atom'         where id = '1f67c97d-70a7-54e7-8fee-dee550d0b891'; -- Physics
update public.topics set icon = 'TestTube'     where id = '9a272527-a274-506f-8f34-431fa74926fb'; -- Chemistry
update public.topics set icon = 'Dna'          where id = '1d16715d-cbfe-5fca-8952-af13168672fb'; -- Biology
update public.topics set icon = 'Telescope'    where id = 'e072feed-e32c-5a61-998e-e63ca5f2cf45'; -- Cosmology & Astronomy
update public.topics set icon = 'Zap'          where id = '7654b55f-fb51-5823-9647-f85befac8dc1'; -- Electrical Engineering
update public.topics set icon = 'Clapperboard' where id = '83f6bd43-8b6f-55e3-8db0-309f46481f6c'; -- Computer Animation
-- Math
update public.topics set icon = 'Variable'     where id = 'cb9d7295-5bcd-55d4-b970-3786cdd51e71'; -- Algebra Basics
update public.topics set icon = 'Calculator'   where id = '602bef9a-7986-5e63-98c9-911e3d4e8054'; -- Pre-Algebra
update public.topics set icon = 'Triangle'     where id = '299a653c-7a0c-5eb2-a17a-3f8dc1e563df'; -- Geometry
update public.topics set icon = 'Waves'        where id = 'dd07541f-3d2e-55f0-bfa2-4ea014b5ce7f'; -- Trigonometry
update public.topics set icon = 'LineChart'    where id = 'a980cd52-1333-5830-ab33-72566c9e6aee'; -- Calculus AB
update public.topics set icon = 'Infinity'     where id = 'e4d00990-ee64-5266-baa7-5442617549fb'; -- Calculus BC
update public.topics set icon = 'Grid3x3'      where id = '32c38b74-958a-5e36-8f58-5111ea5b883f'; -- Linear Algebra
update public.topics set icon = 'Box'          where id = 'c39ee7d2-6f40-53b4-8cb9-374b3ea421f5'; -- Multivariable Calculus
update public.topics set icon = 'Spline'       where id = 'b7d680f3-afa6-5ee4-ad14-0d28efd68f09'; -- Differential Equations
-- CS
update public.topics set icon = 'Braces'       where id = 'a9a701e3-cc9c-5bcb-b0ee-422632aadb65'; -- Computer Programming
update public.topics set icon = 'Cpu'          where id = '7ce2be39-6dc0-5a9b-b7bb-78d9a464891f'; -- Computer Science

comment on column public.topic_groups.icon is 'Lucide icon name in PascalCase (e.g. ''LineChart''). Rendered via <LucideIcon name={...}>.';
comment on column public.topics.icon       is 'Lucide icon name in PascalCase (e.g. ''Atom''). Rendered via <LucideIcon name={...}>. User-created topics may still contain emoji; component falls back to ''•''.';
