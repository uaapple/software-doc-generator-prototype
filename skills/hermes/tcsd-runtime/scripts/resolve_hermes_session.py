#!/usr/bin/env python3
"""Resolve one Hermes session from the exact invocation prompt without exposing prompt content."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-db", required=True)
    parser.add_argument("--expected-skill-name", required=True)
    parser.add_argument("--expected-prompt-sha256", required=True)
    args = parser.parse_args()
    expected_hash = str(args.expected_prompt_sha256).strip().lower()
    if len(expected_hash) != 64 or any(char not in "0123456789abcdef" for char in expected_hash):
        raise SystemExit("Expected prompt SHA-256 is invalid")
    database = Path(args.state_db).resolve()
    if not database.is_file():
        raise SystemExit("Hermes state database does not exist")
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True, timeout=5)
    try:
        columns = {row[1] for row in connection.execute("pragma table_info(messages)")}
        if not {"session_id", "role", "content"}.issubset(columns):
            raise SystemExit("Hermes messages table cannot resolve a session")
        slash_command = f"/{str(args.expected_skill_name).strip()}"
        rows = connection.execute(
            """
            select session_id, content
            from messages
            where role = 'user' and (content = ? or content like ?)
            """,
            (slash_command, f"{slash_command} %"),
        ).fetchall()
    finally:
        connection.close()
    matches = {
        str(session_id or "").strip()
        for session_id, content in rows
        if hashlib.sha256(str(content or "").encode("utf-8")).hexdigest() == expected_hash
        and str(session_id or "").strip()
    }
    if len(matches) != 1:
        raise SystemExit("Hermes invocation prompt did not resolve to exactly one session")
    print(json.dumps({"sessionId": next(iter(matches))}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
