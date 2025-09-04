"""
Seed months of journaling data for a test Clerk user.

User: user_32D1gkVrs6uaWWPxOXJTJjNzUJ8

Usage (local):
  export DATABASE_URL=postgresql://user:pass@localhost:5432/journaling_app
  python backend/scripts/seed_demo_data.py

Matches schema used by MemoryService; safe to re-run (cleans prior data for this user).
"""
from __future__ import annotations
import os
from datetime import datetime, timedelta, time, date
import psycopg2

USER_ID = "user_32D1gkVrs6uaWWPxOXJTJjNzUJ8"


def connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    return psycopg2.connect(url)


def ensure_schema(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          clerk_user_id TEXT UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS journal_entries (
          id SERIAL PRIMARY KEY,
          clerk_user_id TEXT NOT NULL,
          title TEXT,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_goals (
          clerk_user_id TEXT PRIMARY KEY,
          goals_json TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


def seed_user(conn):
    cur = conn.cursor()
    ensure_schema(cur)
    # Upsert user
    cur.execute(
        """
        INSERT INTO users (clerk_user_id) VALUES (%s)
        ON CONFLICT (clerk_user_id) DO NOTHING
        """,
        (USER_ID,),
    )
    # Clean old data
    # Conversations are not retained
    cur.execute("DELETE FROM journal_entries WHERE clerk_user_id = %s", (USER_ID,))
    cur.execute("DELETE FROM user_goals WHERE clerk_user_id = %s", (USER_ID,))

    # Goals
    cur.execute(
        """
        INSERT INTO user_goals (clerk_user_id, goals_json, updated_at)
        VALUES (%s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (clerk_user_id)
        DO UPDATE SET goals_json = EXCLUDED.goals_json, updated_at = CURRENT_TIMESTAMP
        """,
        (
            USER_ID,
            '["reduce work stress", "improve sleep", "exercise consistently", "practice gratitude", "stay present"]',
        ),
    )

    today = date.today()

    def insert_entry(d: date, t: time, title: str, content: str):
        dt = datetime.combine(d, t)
        cur.execute(
            """
            INSERT INTO journal_entries (clerk_user_id, title, content, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (USER_ID, title, content, dt, dt),
        )

    # Current streak: 10 days up to today
    for offs in range(0, 10):
        d = today - timedelta(days=offs)
        dow = d.weekday()  # Mon=0..Sun=6
        base = {
            6: "Sunday reflections with family brunch and gratitude. Felt calm and present. Practiced mindfulness and a short walk.",
            0: "Monday brought work stress and deadlines. Practiced breathing, took a mindful break. Anxiety noticeable but manageable.",
            1: "Focused deep work and learning new skills. Coffee helped; mood positive, productive, and optimistic about goals.",
            2: "Midweek fatigue due to poor sleep. Tension in shoulders; tried a nap and meditation to reset.",
            3: "Gym workout and evening reading. Energy improved. Feeling grateful and grounded after exercise.",
            4: "Time with friends. Laughter, joy, and connection. Low stress today and strong sense of support.",
            5: "Long run in the park and reflective journaling. Planning next week with intention and self-compassion.",
        }[dow]
        content = base + " Keywords: work, stress, sleep, exercise, gratitude, family, friends, anxiety, meditation, running."
        insert_entry(d, time(9, 30), f"Journal Entry - {d}", content)

    # Earlier best streak: 15 consecutive days ~60..46 days ago
    for offs in range(46, 61):
        d = today - timedelta(days=offs)
        mod = (d.weekday() % 3)
        addon = (
            "Work felt manageable; stress reduced after walks and better boundaries." if mod == 0 else
            "Energy steady; enjoyed reading and meditation; anxiety noticeably lower." if mod == 1 else
            "Improved mood and productivity; kept present with mindful breaks and deep breathing."
        )
        content = (
            "Earlier streak focus on healthy routines: consistent sleep, daily exercise, and evening gratitude journaling. "
            + addon
            + " Keywords: routine, exercise, sleep, gratitude, mindfulness, boundaries, learning."
        )
        insert_entry(d, time(8, 45), f"Journal Entry - {d}", content)

    # Scattered entries 80..120 days ago, every 3 days
    for offs in range(80, 121, 3):
        d = today - timedelta(days=offs)
        dow = d.weekday()
        bases = {
            6: "Weekend hike and nature therapy. Gratitude for family time and recovery sleep.",
            0: "Challenging meeting increased stress; practiced breathing and set priorities.",
            1: "Solid workout and protein-rich meals; mood stable and focused on learning.",
            2: "Rest day; noticed rumination and redirected with a mindful pause.",
            3: "Progress on side project; reading before bed improved sleep quality.",
            4: "Dinner with friends; joyful connection and laughter; low anxiety.",
            5: "Long walk listening to music; journaling and planning manageable goals.",
        }
        content = bases.get(dow, bases[5]) + " Keywords: planning, gratitude, stress, anxiety, exercise, sleep, friends, family, learning, walking."
        insert_entry(d, time(19, 15), f"Journal Entry - {d}", content)

    # A day with two entries to test aggregation
    d = today - timedelta(days=2)
    insert_entry(d, time(8, 0), "Morning reflections - dual entry test", "Short note: gratitude for coffee and quiet time. Light exercise planned. Keywords: gratitude, coffee, quiet, exercise.")
    insert_entry(d, time(20, 30), "Evening wrap-up - dual entry test", "Evening check-in: a bit of stress, managed with a walk and deep breathing. Keywords: stress, walk, breathing.")

    # Conversations removed from seed data

    conn.commit()
    cur.close()


if __name__ == "__main__":
    conn = connect()
    try:
        seed_user(conn)
        print("✓ Seeded demo data for", USER_ID)
    finally:
        conn.close()
