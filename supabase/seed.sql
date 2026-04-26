-- seed.sql — preset topic groups, topics, courses, and lessons from Khan Academy.
-- Re-runnable: fixed UUIDs + ON CONFLICT guards make this idempotent.

-- ===== Topic groups (5 preset super-categories) =====
-- Order: finance → humanities → stem → math → cs (per brainstorming decision).
insert into public.topic_groups (id, owner_id, is_preset, key, title, position, icon) values
  ('00000000-0000-0000-0000-0000000000a1', null, true, 'finance',    '经济金融', 0, '💰'),
  ('00000000-0000-0000-0000-0000000000a2', null, true, 'humanities', '人文历史', 1, '📜'),
  ('00000000-0000-0000-0000-0000000000a3', null, true, 'stem',       '理工',     2, '🔬'),
  ('00000000-0000-0000-0000-0000000000a4', null, true, 'math',       '数学',     3, '∑'),
  ('00000000-0000-0000-0000-0000000000a5', null, true, 'cs',         '编程',     4, '💻')
on conflict (id) do update set
  key = excluded.key,
  title = excluded.title,
  position = excluded.position,
  icon = excluded.icon;

-- ===== Topics (5 preset, mapped to groups) =====
-- Transitional mapping: existing 5 topics each pin to the most-natural group
-- so things keep working after migration 0009. PR2 will replace these with
-- 24 Khan-imported topics under the same 5 groups.
insert into public.topics (id, owner_id, is_preset, title, icon, color, position, group_id) values
  ('10000000-0000-0000-0000-000000000001', null, true, 'Physics',     '🧲', '#5e6ad2', 0, '00000000-0000-0000-0000-0000000000a3'),
  ('10000000-0000-0000-0000-000000000002', null, true, 'Biology',     '🧬', '#10b981', 1, '00000000-0000-0000-0000-0000000000a3'),
  ('10000000-0000-0000-0000-000000000003', null, true, 'Economics',   '💰', '#f4c874', 2, '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000004', null, true, 'Math',        '📐', '#d96f3d', 3, '00000000-0000-0000-0000-0000000000a4'),
  ('10000000-0000-0000-0000-000000000005', null, true, 'Programming', '💻', '#4c56c4', 4, '00000000-0000-0000-0000-0000000000a5')
on conflict (id) do update set
  title = excluded.title,
  icon = excluded.icon,
  color = excluded.color,
  position = excluded.position,
  group_id = excluded.group_id;

-- ===== Courses (10 preset, 2 per topic) =====
-- Note: legacy `topic` text column dropped in 0009. Only `topic_id` is used.
insert into public.courses (id, owner_id, is_preset, title, topic_id, icon, position) values
  -- Physics
  ('20000000-0000-0000-0000-000000000011', null, true, 'Forces & Newton''s Laws', '10000000-0000-0000-0000-000000000001', '🧲', 0),
  ('20000000-0000-0000-0000-000000000012', null, true, 'Motion & Energy',         '10000000-0000-0000-0000-000000000001', '🚀', 1),
  -- Biology
  ('20000000-0000-0000-0000-000000000021', null, true, 'Cell Structure',          '10000000-0000-0000-0000-000000000002', '🧬', 0),
  ('20000000-0000-0000-0000-000000000022', null, true, 'Cell Organelles',         '10000000-0000-0000-0000-000000000002', '🔬', 1),
  -- Economics
  ('20000000-0000-0000-0000-000000000031', null, true, 'Intro to Economics',      '10000000-0000-0000-0000-000000000003', '💰', 0),
  ('20000000-0000-0000-0000-000000000032', null, true, 'Supply & Demand',         '10000000-0000-0000-0000-000000000003', '📈', 1),
  -- Math
  ('20000000-0000-0000-0000-000000000041', null, true, 'Intro to Limits',         '10000000-0000-0000-0000-000000000004', '∞', 0),
  ('20000000-0000-0000-0000-000000000042', null, true, 'Algebra Basics',          '10000000-0000-0000-0000-000000000004', '🔢', 1),
  -- Programming
  ('20000000-0000-0000-0000-000000000051', null, true, 'Intro to CS (Python)',    '10000000-0000-0000-0000-000000000005', '🐍', 0),
  ('20000000-0000-0000-0000-000000000052', null, true, 'Algorithms',              '10000000-0000-0000-0000-000000000005', '🧮', 1)
on conflict (id) do update set
  title = excluded.title,
  topic_id = excluded.topic_id,
  icon = excluded.icon,
  position = excluded.position;

-- ===== Lessons (21 total) =====
-- All from Khan Academy. duration_seconds=0 because oembed doesn't give duration;
-- the UI renders "—" for zero-duration lessons. PR2 will replace with real durations.

insert into public.lessons (id, course_id, position, title, yt_id, duration_seconds) values
  -- Forces & Newton's Laws (4)
  ('30000000-0000-0000-0000-000000000111', '20000000-0000-0000-0000-000000000011', 1, 'Newton''s first law',                'rjkQcfw5fkM', 0),
  ('30000000-0000-0000-0000-000000000112', '20000000-0000-0000-0000-000000000011', 2, 'More on Newton''s first law',        'CQYELiTtUs8', 0),
  ('30000000-0000-0000-0000-000000000113', '20000000-0000-0000-0000-000000000011', 3, 'AP Physics 1 review of Forces',      'Bkl6Mn1Y23Q', 0),
  ('30000000-0000-0000-0000-000000000114', '20000000-0000-0000-0000-000000000011', 4, 'Unbalanced forces and motion',       'IgYUR7aFY-c', 0),
  -- Motion & Energy (3)
  ('30000000-0000-0000-0000-000000000121', '20000000-0000-0000-0000-000000000012', 1, 'Horizontally launched projectile',   'jmSWImPs6fQ', 0),
  ('30000000-0000-0000-0000-000000000122', '20000000-0000-0000-0000-000000000012', 2, 'Projectile at an angle',             'ZZ39o1rAZWY', 0),
  ('30000000-0000-0000-0000-000000000123', '20000000-0000-0000-0000-000000000012', 3, 'Projectile motion (AP Physics 1)',   'txJP95lBv98', 0),
  -- Cell Structure (3)
  ('30000000-0000-0000-0000-000000000211', '20000000-0000-0000-0000-000000000021', 1, 'Introduction to the cell',           '5KfHxF6Vhps', 0),
  ('30000000-0000-0000-0000-000000000212', '20000000-0000-0000-0000-000000000021', 2, 'Parts of a cell',                    'Hmwvj9X4GNY', 0),
  ('30000000-0000-0000-0000-000000000213', '20000000-0000-0000-0000-000000000021', 3, 'Cell theory',                        'zk3vlhz1b6k', 0),
  -- Cell Organelles (2)
  ('30000000-0000-0000-0000-000000000221', '20000000-0000-0000-0000-000000000022', 1, 'Mitochondria',                       'i1dAnpSFbyI', 0),
  ('30000000-0000-0000-0000-000000000222', '20000000-0000-0000-0000-000000000022', 2, 'Organelles in eukaryotic cells',     'bWPQvxElpLY', 0),
  -- Intro to Economics (2)
  ('30000000-0000-0000-0000-000000000311', '20000000-0000-0000-0000-000000000031', 1, 'Intro to Economics (course trailer)','wCHm5SdNO5U', 0),
  ('30000000-0000-0000-0000-000000000312', '20000000-0000-0000-0000-000000000031', 2, 'Introduction to economics',          '8JYP_wU1JTU', 0),
  -- Supply & Demand (3)
  ('30000000-0000-0000-0000-000000000321', '20000000-0000-0000-0000-000000000032', 1, 'Market equilibrium',                 'PEMkfgrifDw', 0),
  ('30000000-0000-0000-0000-000000000322', '20000000-0000-0000-0000-000000000032', 2, 'Law of supply',                      '3xCzhdVtdMI', 0),
  ('30000000-0000-0000-0000-000000000323', '20000000-0000-0000-0000-000000000032', 3, 'Changes in equilibrium',             'kl4n-EWwPyA', 0),
  -- Intro to Limits (1)
  ('30000000-0000-0000-0000-000000000411', '20000000-0000-0000-0000-000000000041', 1, 'Introduction to limits',             'riXcZT2ICjA', 0),
  -- Algebra Basics (1)
  ('30000000-0000-0000-0000-000000000421', '20000000-0000-0000-0000-000000000042', 1, 'Variables, expressions & equations', 'vDqOoI-4Z6M', 0),
  -- Intro to CS Python (1)
  ('30000000-0000-0000-0000-000000000511', '20000000-0000-0000-0000-000000000051', 1, 'Algorithms and selection',           'rJCRGiEidZ4', 0),
  -- Algorithms (1)
  ('30000000-0000-0000-0000-000000000521', '20000000-0000-0000-0000-000000000052', 1, 'What is an algorithm?',              'CvSOaYi89B4', 0)
on conflict (id) do nothing;
