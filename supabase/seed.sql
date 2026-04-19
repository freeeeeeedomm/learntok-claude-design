-- seed.sql — preset courses visible to all users
-- Re-runnable: uses ON CONFLICT guards via stable UUIDs

insert into public.courses (id, owner_id, is_preset, title, topic, icon) values
  ('00000000-0000-0000-0000-000000000001', null, true, 'Intro to React', 'web dev', 'R'),
  ('00000000-0000-0000-0000-000000000002', null, true, 'CSS & Layout',   'web dev', 'C'),
  ('00000000-0000-0000-0000-000000000003', null, true, 'Spanish A1',     'languages', 'ES')
on conflict (id) do nothing;

insert into public.lessons (course_id, position, title, yt_id, duration_seconds) values
  ('00000000-0000-0000-0000-000000000001', 1, 'what is react?',         'Tn6-PIqc4UM', 480),
  ('00000000-0000-0000-0000-000000000001', 2, 'jsx in 100 seconds',     'hviGQ_ZEHuc', 240),
  ('00000000-0000-0000-0000-000000000001', 3, 'components & props',     'Tn6-PIqc4UM', 720),
  ('00000000-0000-0000-0000-000000000001', 4, 'state & hooks',          'hviGQ_ZEHuc', 960),
  ('00000000-0000-0000-0000-000000000002', 1, 'the box model',          'rIO5326FgPE', 360),
  ('00000000-0000-0000-0000-000000000002', 2, 'flexbox',                'phWxA89Dy94', 540),
  ('00000000-0000-0000-0000-000000000002', 3, 'CSS grid',               'rg7Fvvl3taU', 720),
  ('00000000-0000-0000-0000-000000000003', 1, 'greetings & intros',     't7X7x1DnbPY', 480),
  ('00000000-0000-0000-0000-000000000003', 2, 'numbers 1-20',           't7X7x1DnbPY', 360)
on conflict do nothing;
