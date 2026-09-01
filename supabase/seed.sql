-- ============================================================================
-- Seed: the 19 live colleges + the Batch 2025 · Semester 1 spreadsheet.
-- Junk tabs (Sheet10/11/12) and the template tab are intentionally excluded.
-- Re-runnable (idempotent via ON CONFLICT).
-- ============================================================================

insert into colleges (name, code, slug, hue) values
  ('NIAT Chevella', 'N25H02B', 'niat-chevella', 212),
  ('CITY',          'CITY',    'city',          265),
  ('CIET',          'CIET',    'ciet',          150),
  ('NRI',           'NRI',     'nri',            24),
  ('ADYPU',         'ADYPU',   'adypu',         330),
  ('VGU',           'VGU',     'vgu',           190),
  ('Annamacharya',  'ANMC',    'annamacharya',  280),
  ('Takshashila',   'TAKS',    'takshashila',    45),
  ('CDU',           'CDU',     'cdu',           172),
  ('Aurora',        'AUR',     'aurora',        210),
  ('NSRIT',         'NSRIT',   'nsrit',          12),
  ('MRV',           'MRV',     'mrv',           300),
  ('AMET',          'AMET',    'amet',          130),
  ('NIU',           'NIU',     'niu',           255),
  ('Svyasa',        'SVY',     'svyasa',         88),
  ('Crescent',      'CRES',    'crescent',      340),
  ('SGU',           'SGU',     'sgu',           200),
  ('Yenepoya',      'YEN',     'yenepoya',      160)
on conflict (code) do update set name = excluded.name, hue = excluded.hue;

insert into semesters (batch, name, spreadsheet_id) values
  ('2025', 'Semester 1', '1XjpOv2b_cX356l-Ayk64o7l2yEntyL7dvslWpZN4Nx8')
on conflict (batch, name) do update set spreadsheet_id = excluded.spreadsheet_id;

-- Map each live tab → college for this semester.
-- Aurora is one college with two term-sheets.
with s as (select id from semesters where batch='2025' and name='Semester 1')
insert into college_sheets (semester_id, college_id, tab_name, term)
select s.id, c.id, v.tab, v.term
from s
join (values
  ('NIAT Chevella',  'N25H02B', null),
  ('CITY',           'CITY',    null),
  ('CIET',           'CIET',    null),
  ('NRI',            'NRI',     null),
  ('ADYPU',          'ADYPU',   null),
  ('VGU',            'VGU',     null),
  ('Annamacharya',   'ANMC',    null),
  ('Takshashila',    'TAKS',    null),
  ('CDU',            'CDU',     null),
  ('Aurora -Term-I', 'AUR',     'Term I'),
  ('Aurora -Term-II','AUR',     'Term II'),
  ('NSRIT',          'NSRIT',   null),
  ('MRV',            'MRV',     null),
  ('AMET',           'AMET',    null),
  ('NIU',            'NIU',     null),
  ('Svyasa',         'SVY',     null),
  ('Crescent',       'CRES',    null),
  ('SGU',            'SGU',     null),
  ('Yenepoya',       'YEN',     null)
) as v(tab, ccode, term) on true
join colleges c on c.code = v.ccode
on conflict (semester_id, tab_name) do nothing;
