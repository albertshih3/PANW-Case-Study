"""
Backfill script: encrypt existing plaintext journal entries and user goals.

Usage (zsh):
  # Ensure env is set so the same key derivation is used
  export DATABASE_URL=postgresql://user:pass@host:5432/db
  export DATA_ENCRYPTION_SECRET="<your-strong-secret>"
  python backend/scripts/backfill_encrypt.py               # all users
  python backend/scripts/backfill_encrypt.py --user USER_X # single user

Notes:
 - Safe to re-run; already-encrypted values are skipped.
 - Requires Python deps from backend/requirements.txt (cryptography, psycopg2).
"""
from __future__ import annotations
import argparse
import base64
import os
import sys
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor

# Ensure we can import services.crypto_utils when run from repo root
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.crypto_utils import encrypt_text_for_user  # type: ignore


def is_encrypted(value: str) -> bool:
    """Heuristic: base64-decode and check for KEO1 prefix bytes."""
    try:
        raw = base64.b64decode(value)
        return len(raw) > 16 and raw.startswith(b"KEO1")
    except Exception:
        return False


def connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    return psycopg2.connect(url)


def list_users(conn, only_user: str | None):
    cur = conn.cursor(cursor_factory=RealDictCursor)
    if only_user:
        cur.execute("SELECT clerk_user_id FROM users WHERE clerk_user_id = %s", (only_user,))
    else:
        cur.execute("SELECT clerk_user_id FROM users")
    rows = [r["clerk_user_id"] for r in (cur.fetchall() or [])]
    cur.close()
    return rows


def backfill_user(conn, clerk_user_id: str) -> tuple[int, int]:
    """Return (journal_updates, goals_updates)."""
    j_updates = 0
    g_updates = 0

    # Journal entries
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT id, title, content FROM journal_entries
        WHERE clerk_user_id = %s
        """,
        (clerk_user_id,),
    )
    rows = cur.fetchall() or []
    for r in rows:
        jid = r["id"]
        title = r.get("title")
        content = r.get("content") or ""
        # Skip if content looks encrypted
        if isinstance(content, str) and is_encrypted(content):
            continue
        enc_title = encrypt_text_for_user(clerk_user_id, title) if title is not None else None
        enc_content = encrypt_text_for_user(clerk_user_id, content)
        cur2 = conn.cursor()
        cur2.execute(
            """
            UPDATE journal_entries
            SET title = %s, content = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND clerk_user_id = %s
            """,
            (enc_title, enc_content, jid, clerk_user_id),
        )
        cur2.close()
        j_updates += 1
    cur.close()

    # User goals
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT goals_json FROM user_goals WHERE clerk_user_id = %s", (clerk_user_id,))
    row = cur.fetchone()
    if row and (gj := row.get("goals_json")) and isinstance(gj, str) and not is_encrypted(gj):
        enc = encrypt_text_for_user(clerk_user_id, gj)
        cur2 = conn.cursor()
        cur2.execute(
            """
            UPDATE user_goals
            SET goals_json = %s, updated_at = CURRENT_TIMESTAMP
            WHERE clerk_user_id = %s
            """,
            (enc, clerk_user_id),
        )
        cur2.close()
        g_updates = 1
    cur.close()

    return j_updates, g_updates


def main():
    if not os.getenv("DATA_ENCRYPTION_SECRET"):
        print("ERROR: DATA_ENCRYPTION_SECRET is not set; cannot encrypt. Export it and retry.")
        sys.exit(2)

    parser = argparse.ArgumentParser(description="Encrypt plaintext journals/goals in-place.")
    parser.add_argument("--user", dest="user", help="Optional Clerk user id to limit backfill", default=None)
    args = parser.parse_args()

    conn = connect()
    try:
        users = list_users(conn, args.user)
        total_j = 0
        total_g = 0
        for u in users:
            j, g = backfill_user(conn, u)
            conn.commit()
            total_j += j
            total_g += g
            print(f"✓ {u}: journals updated={j}, goals updated={g}")
        print(f"Done. Total journals updated={total_j}, goals updated={total_g}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
