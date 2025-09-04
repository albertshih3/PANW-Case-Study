-- Seed demo data for a test user in Supabase/Postgres (plaintext for demo)
-- User: user_32D1gkVrs6uaWWPxOXJTJjNzUJ8
--
-- Usage: Paste into the Supabase SQL editor and run. Idempotent: cleans prior data for this user.

BEGIN;

-- Conversations are not retained; no pgvector needed.

-- Ensure tables exist (aligns with backend/services/memory_service.py)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Upsert user
INSERT INTO users (clerk_user_id) VALUES ('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8')
ON CONFLICT (clerk_user_id) DO NOTHING;

-- Cleanup for repeatable runs
DELETE FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';
DELETE FROM user_goals WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';

-- Goals (fresh set)
INSERT INTO user_goals (clerk_user_id, goals_json, updated_at)
VALUES (
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8',
  '["improve focus", "reduce screen time", "sleep by 11pm", "exercise 4x/week", "practice gratitude"]',
  NOW()
)
ON CONFLICT (clerk_user_id)
DO UPDATE SET goals_json = EXCLUDED.goals_json, updated_at = NOW();

-- Recent 14-day activity: mix of moods, habits, and themes
WITH params AS (
  SELECT NOW()::date AS today
)
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
SELECT
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8',
  CASE WHEN (offs % 5 = 0) THEN NULL ELSE 'Daily Journal - ' || to_char(d, 'YYYY-MM-DD') END AS title, -- some NULL titles
  (
    CASE EXTRACT(DOW FROM d)
      WHEN 0 THEN 'Sunday reset: planned week, light yoga, long call with family. Calm and grateful.'
      WHEN 1 THEN 'Monday sprint kickoff: heavy meetings, deep work blocks helped. Stress noticeable but managed.'
      WHEN 2 THEN 'Focused coding session; took breaks to avoid screen fatigue. Energy steady.'
      WHEN 3 THEN 'Midweek slump; slept poorly. Short nap + walk improved mood. Practiced breathing.'
      WHEN 4 THEN 'Gym session and reading at night. Felt grounded and productive.'
      WHEN 5 THEN 'Dinner with friends; laughed a lot. Anxiety low, connection high. '
      WHEN 6 THEN 'Long run outdoors; reflective journaling. Set intentions for next week.'
    END
    || ' Keywords: focus, screen-time, sleep, exercise, gratitude, friends, family, stress, meditation, planning.'
  ) AS content,
  d::timestamp + (
    CASE (offs % 3)
      WHEN 0 THEN TIME '08:10'
      WHEN 1 THEN TIME '12:30'
      ELSE TIME '20:20'
    END
  ) AS created_at,
  d::timestamp + (
    CASE (offs % 3)
      WHEN 0 THEN TIME '08:10'
      WHEN 1 THEN TIME '12:30'
      ELSE TIME '20:20'
    END
  ) AS updated_at
FROM params p
JOIN LATERAL (
  SELECT (p.today - offs) AS d, offs
  FROM generate_series(0, 13) AS offs
) days ON TRUE
ORDER BY d;

-- "Focus Sprint" week ~35..41 days ago (productivity themes)
WITH params AS (
  SELECT NOW()::date AS today
)
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
SELECT
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8',
  'Focus Sprint - ' || to_char(d, 'YYYY-MM-DD'),
  (
    'Week-long focus sprint. '
    || CASE (EXTRACT(DOW FROM d)::int)
      WHEN 1 THEN 'Planned backlog, set priorities, blocked calendar. '
      WHEN 2 THEN 'Deep work on hardest task; minimized notifications. '
      WHEN 3 THEN 'Pairing session helped unblock; took mindful breaks. '
      WHEN 4 THEN 'Reviewed progress; adjusted goals; gym after work. '
      WHEN 5 THEN 'Shipped milestone; celebrated small wins; early bedtime. '
      ELSE 'Weekend reflection and recovery; nature walk and journaling. '
    END
    || ' Keywords: productivity, deep-work, priorities, mindfulness, gym, sleep, celebration.'
  ) AS content,
  d::timestamp + TIME '09:00',
  d::timestamp + TIME '09:00'
FROM params p
JOIN LATERAL (
  SELECT (p.today - offs) AS d
  FROM generate_series(35, 41) AS offs
) days ON TRUE
ORDER BY d;

-- Older scattered entries for diversity (~100..160 days ago, every 5 days)
WITH params AS (
  SELECT NOW()::date AS today
)
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
SELECT
  'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8',
  'Archive - ' || to_char(d, 'YYYY-MM-DD'),
  (
    CASE (EXTRACT(DOW FROM d)::int)
      WHEN 0 THEN 'Weekend hike; felt present and energized. '
      WHEN 1 THEN 'Challenging meeting; practiced boundaries and deep breathing. '
      WHEN 2 THEN 'Solid workout; protein-forward meals; steady focus. '
      WHEN 3 THEN 'Rest day; noticed rumination; used a mindful pause. '
      WHEN 4 THEN 'Side project progress; reading improved sleep quality. '
      WHEN 5 THEN 'Dinner with friends; joyful connection; low anxiety. '
      ELSE 'Long walk with music; set manageable goals. '
    END || ' Keywords: planning, gratitude, stress, anxiety, exercise, sleep, friends, boundaries, learning, walking.'
  ) AS content,
  d::timestamp + TIME '18:30',
  d::timestamp + TIME '18:30'
FROM params p
JOIN LATERAL (
  SELECT (p.today - offs) AS d
  FROM generate_series(100, 160, 5) AS offs
) days ON TRUE
ORDER BY d;

-- A couple special cases: two entries on the same day, different times
INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
VALUES
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Morning note - dual entry day', 'Grateful for quiet morning and coffee. Plan: short run + focus blocks. Keywords: gratitude, coffee, running, planning.', (NOW()::date - INTERVAL '3 days') + TIME '07:50', (NOW()::date - INTERVAL '3 days') + TIME '07:50'),
('user_32D1gkVrs6uaWWPxOXJTJjNzUJ8', 'Evening reflection - dual entry day', 'Evening check-in: shipped a task; walked to unwind; early lights out. Keywords: shipping, walking, sleep.', (NOW()::date - INTERVAL '3 days') + TIME '20:40', (NOW()::date - INTERVAL '3 days') + TIME '20:40');

COMMIT;

-- Optional quick checks
-- SELECT COUNT(*) AS journals FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';
-- SELECT MIN(created_at), MAX(created_at) FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8';
-- SELECT COUNT(DISTINCT DATE(created_at)) FROM journal_entries WHERE clerk_user_id = 'user_32D1gkVrs6uaWWPxOXJTJjNzUJ8' AND created_at >= NOW() - INTERVAL '30 days';
