-- Seed demo data for a test user in Supabase/Postgres
-- User: user_32D1gkVrs6uaWWPxOXJTJjNzUJ8
-- This script creates months of journaling data to exercise: goals, 
-- engagement streaks, keyword cloud, sparkline, trends, summaries, and conversations.
--
-- Usage: Paste into the Supabase SQL editor and run. Safe to re-run; it cleans prior data for this user.

BEGIN;

-- Ensure pgvector is available (required for conversations.embedding)
CREATE EXTENSION IF NOT EXISTS vector;

-- Ensure tables exist (matches backend/services/memory_service.py)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  embedding VECTOR(1536),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_goals (
  clerk_user_id TEXT PRIMARY KEY,
  goals_json TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Target user
-- Tip: change this in one place if adapting
-- (Postgres has no simple variables in plain SQL; we repeat the literal as needed.)
INSERT INTO users (clerk_user_id) VALUES ('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8')
ON CONFLICT (clerk_user_id) DO NOTHING;

-- Cleanup for idempotent runs
DELETE FROM conversations WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';
DELETE FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';
DELETE FROM user_goals WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';

-- Goals (focus areas)
INSERT INTO user_goals (clerk_user_id, goals_json, updated_at)
VALUES (
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8',
  '["reduce work stress", "improve sleep", "exercise consistently", "practice gratitude", "stay present"]',
  NOW()
)
ON CONFLICT (clerk_user_id)
DO UPDATE SET goals_json = EXCLUDED.goals_json, updated_at = NOW();

-- Helper CTEs for content generation
WITH params AS (
  SELECT NOW()::date AS today
)
-- Recent 10-day current streak: one entry per day (today back to 9 days)
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
SELECT 
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8' AS clerk_user_id,
  'Journal Entry - ' || to_char(d, 'YYYY-MM-DD') AS title,
  (
    CASE EXTRACT(DOW FROM d)
      WHEN 0 THEN 'Sunday reflections with family brunch and gratitude. Felt calm and present. Practiced mindfulness and a short walk.'
      WHEN 1 THEN 'Monday brought work stress and deadlines. Practiced breathing, took a mindful break. Anxiety noticeable but manageable.'
      WHEN 2 THEN 'Focused deep work and learning new skills. Coffee helped; mood positive, productive, and optimistic about goals.'
      WHEN 3 THEN 'Midweek fatigue due to poor sleep. Tension in shoulders; tried a nap and meditation to reset.'
      WHEN 4 THEN 'Gym workout and evening reading. Energy improved. Feeling grateful and grounded after exercise.'
      WHEN 5 THEN 'Time with friends. Laughter, joy, and connection. Low stress today and strong sense of support.'
      WHEN 6 THEN 'Long run in the park and reflective journaling. Planning next week with intention and self-compassion.'
    END
    || ' Keywords: work, stress, sleep, exercise, gratitude, family, friends, anxiety, meditation, running.'
  ) AS content,
  d::timestamp + TIME '09:30' AS created_at,
  d::timestamp + TIME '09:30' AS updated_at
FROM params p,
LATERAL (
  SELECT (p.today - offs) AS d
  FROM generate_series(0, 9) AS offs
) days;

-- Earlier 15-day best streak (about 60 to 46 days ago)
WITH params AS (
  SELECT NOW()::date AS today
)
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
SELECT 
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8',
  'Journal Entry - ' || to_char(d, 'YYYY-MM-DD'),
  (
    'Earlier streak focus on healthy routines: consistent sleep, daily exercise, and evening gratitude journaling. '
    || CASE (EXTRACT(DOW FROM d)::int % 3)
      WHEN 0 THEN 'Work felt manageable; stress reduced after walks and better boundaries.'
      WHEN 1 THEN 'Energy steady; enjoyed reading and meditation; anxiety noticeably lower.'
      ELSE 'Improved mood and productivity; kept present with mindful breaks and deep breathing.'
    END
    || ' Keywords: routine, exercise, sleep, gratitude, mindfulness, boundaries, learning.'
  ),
  d::timestamp + TIME '08:45',
  d::timestamp + TIME '08:45'
FROM params p,
LATERAL (
  SELECT (p.today - offs) AS d
  FROM generate_series(46, 60) AS offs
) days
ORDER BY d;

-- Scattered entries across ~120 to ~80 days ago for keyword diversity
WITH params AS (
  SELECT NOW()::date AS today
)
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
SELECT 
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8',
  'Journal Entry - ' || to_char(d, 'YYYY-MM-DD'),
  (
    CASE (EXTRACT(DOW FROM d)::int)
      WHEN 0 THEN 'Weekend hike and nature therapy. Gratitude for family time and recovery sleep.'
      WHEN 1 THEN 'Challenging meeting increased stress; practiced breathing and set priorities.'
      WHEN 2 THEN 'Solid workout and protein-rich meals; mood stable and focused on learning.'
      WHEN 3 THEN 'Rest day; noticed rumination and redirected with a mindful pause.'
      WHEN 4 THEN 'Progress on side project; reading before bed improved sleep quality.'
      WHEN 5 THEN 'Dinner with friends; joyful connection and laughter; low anxiety.'
      ELSE 'Long walk listening to music; journaling and planning manageable goals.'
    END || ' Keywords: planning, gratitude, stress, anxiety, exercise, sleep, friends, family, learning, walking.'
  ),
  d::timestamp + TIME '19:15',
  d::timestamp + TIME '19:15'
FROM params p,
LATERAL (
  SELECT (p.today - offs) AS d
  FROM generate_series(80, 120, 3) AS offs  -- every 3 days between 80 and 120 days ago
) days
ORDER BY d;

-- A couple of days with two entries to test aggregation by day
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
VALUES
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Morning reflections - dual entry test', 'Short note: gratitude for coffee and quiet time. Light exercise planned. Keywords: gratitude, coffee, quiet, exercise.', (NOW()::date - INTERVAL '2 days') + TIME '08:00', (NOW()::date - INTERVAL '2 days') + TIME '08:00'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Evening wrap-up - dual entry test', 'Evening check-in: a bit of stress, managed with a walk and deep breathing. Keywords: stress, walk, breathing.', (NOW()::date - INTERVAL '2 days') + TIME '20:30', (NOW()::date - INTERVAL '2 days') + TIME '20:30');

-- Conversations (recent context for AI)
INSERT INTO conversations (clerk_user_id, user_message, ai_response, embedding, timestamp)
VALUES
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'I felt overwhelmed by a deadline at work today but a short break and breathing helped.', 'It''s great you paused and breathed. What made the deadline feel overwhelming, and what small boundary could help next time?', NULL, NOW() - INTERVAL '8 days'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Slept poorly midweek and noticed more anxiety.', 'Noticing that pattern is powerful. Would a consistent wind-down routine be worth trying tonight?', NULL, NOW() - INTERVAL '6 days'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Went for a long run and felt proud.', 'Lovely. What did the run shift in your mood, and how might you keep that momentum?', NULL, NOW() - INTERVAL '5 days'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Had a joyful dinner with friends—lots of laughter.', 'Connection can recharge us. What stood out about being with friends?', NULL, NOW() - INTERVAL '3 days'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Started reading before bed and sleep improved.', 'Great experiment. What cues remind you to start your wind-down routine?', NULL, NOW() - INTERVAL '2 days'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Today I felt calm and focused after a morning stretch.', 'Nice start. How did that calm show up later in your day?', NULL, NOW() - INTERVAL '1 days'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Family brunch on Sunday brought gratitude.', 'That sounds nourishing. What made it feel meaningful this week?', NULL, NOW() - INTERVAL '9 days'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'A difficult conversation at work—but I stayed present.', 'That took courage. What did staying present change about the outcome?', NULL, NOW() - INTERVAL '12 days');

COMMIT;

-- Optional quick checks
-- SELECT COUNT(*) AS journals FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';
-- SELECT MIN(created_at), MAX(created_at) FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';
-- SELECT COUNT(DISTINCT DATE(created_at)) FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8' AND created_at >= NOW() - INTERVAL '30 days';
