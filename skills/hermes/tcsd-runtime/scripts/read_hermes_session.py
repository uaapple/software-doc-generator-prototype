#!/usr/bin/env python3
"""Read non-sensitive model/token telemetry for one Hermes session."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


FIELDS = (
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "reasoning_tokens",
    "estimated_cost_usd",
    "actual_cost_usd",
    "cost_status",
    "model",
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-db", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--expected-skill-name", required=True)
    parser.add_argument("--expected-skill-file", required=True)
    parser.add_argument("--expected-skill-sha256", required=True)
    parser.add_argument("--skill-usage-file", required=True)
    parser.add_argument("--expected-use-count-before", required=True, type=int)
    parser.add_argument("--invocation-started-at", required=True)
    parser.add_argument("--invocation-ended-at", required=True)
    args = parser.parse_args()
    database = Path(args.state_db).resolve()
    if not database.is_file():
        raise SystemExit("Hermes state database does not exist")
    expected_hash = hashlib.sha256(Path(args.expected_skill_file).read_bytes()).hexdigest()
    if expected_hash != args.expected_skill_sha256:
        raise SystemExit("Expected installed skill file hash does not match the job snapshot")
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
    try:
        columns = {row[1] for row in connection.execute("pragma table_info(sessions)")}
        selected = [field for field in FIELDS if field in columns]
        if "id" not in columns or "model" not in selected:
            raise SystemExit("Hermes sessions table does not expose required telemetry")
        row = connection.execute(
            f"select {', '.join(selected)} from sessions where id = ?",
            (args.session_id,),
        ).fetchone()
        message_columns = {row[1] for row in connection.execute("pragma table_info(messages)")}
        if not {"id", "session_id", "role", "content"}.issubset(message_columns):
            raise SystemExit("Hermes messages table does not expose skill loading evidence")
        slash_command = f"/{args.expected_skill_name}"
        loaded_message = connection.execute(
            """
            select id, content
            from messages
            where session_id = ? and role = 'user'
            order by timestamp asc, id asc
            """,
            (args.session_id,),
        ).fetchall()
    finally:
        connection.close()
    if row is None:
        raise SystemExit("Hermes session telemetry was not found")
    matching_messages = []
    for message_id, message_content in loaded_message:
        content = str(message_content or "").lstrip()
        if content == slash_command or content.startswith(f"{slash_command} "):
            matching_messages.append((message_id, message_content))
    if not matching_messages:
        raise SystemExit("Hermes session has no exact slash-skill invocation message")
    message_id, message_content = matching_messages[0]

    usage_path = Path(args.skill_usage_file).resolve()
    try:
        usage_data = json.loads(usage_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Hermes skill usage telemetry is unavailable: {exc}") from exc
    usage_record = usage_data.get(args.expected_skill_name) if isinstance(usage_data, dict) else None
    if not isinstance(usage_record, dict):
        raise SystemExit("Hermes skill usage telemetry has no expected skill record")
    try:
        use_count_after = int(usage_record.get("use_count") or 0)
    except (TypeError, ValueError) as exc:
        raise SystemExit("Hermes skill usage count is invalid") from exc
    if args.expected_use_count_before < 0 or use_count_after <= args.expected_use_count_before:
        raise SystemExit("Hermes skill usage count did not increase during the session")
    last_used_raw = str(usage_record.get("last_used_at") or "").strip()
    try:
        last_used_at = datetime.fromisoformat(last_used_raw.replace("Z", "+00:00"))
        invocation_started_at = datetime.fromisoformat(args.invocation_started_at.replace("Z", "+00:00"))
        invocation_ended_at = datetime.fromisoformat(args.invocation_ended_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SystemExit("Hermes skill usage timestamps are invalid") from exc
    if last_used_at.tzinfo is None:
        last_used_at = last_used_at.replace(tzinfo=timezone.utc)
    if invocation_started_at.tzinfo is None:
        invocation_started_at = invocation_started_at.replace(tzinfo=timezone.utc)
    if invocation_ended_at.tzinfo is None:
        invocation_ended_at = invocation_ended_at.replace(tzinfo=timezone.utc)
    if not invocation_started_at <= last_used_at <= invocation_ended_at:
        raise SystemExit("Hermes skill usage timestamp is outside the session invocation window")
    values = dict(zip(selected, row))
    integer = lambda name: max(0, int(values.get(name) or 0))
    input_tokens = integer("input_tokens")
    output_tokens = integer("output_tokens")
    cache_read_tokens = integer("cache_read_tokens")
    cache_write_tokens = integer("cache_write_tokens")
    payload = {
        "model": str(values.get("model") or "").strip(),
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "cacheReadTokens": cache_read_tokens,
        "cacheWriteTokens": cache_write_tokens,
        "reasoningTokens": integer("reasoning_tokens"),
        "totalTokens": input_tokens + output_tokens + cache_read_tokens + cache_write_tokens,
        "estimatedCostUsd": values.get("estimated_cost_usd"),
        "actualCostUsd": values.get("actual_cost_usd"),
        "costStatus": str(values.get("cost_status") or ""),
        "skillLoad": {
            "source": "hermes-state-db+skill-usage",
            "loaded": True,
            "skillName": args.expected_skill_name,
            "skillFileSha256": expected_hash,
            "messageId": int(message_id),
            "messageSha256": hashlib.sha256(str(message_content).encode("utf-8")).hexdigest(),
            "usageCountBefore": args.expected_use_count_before,
            "usageCountAfter": use_count_after,
            "lastUsedAt": last_used_at.isoformat(),
        },
    }
    if not payload["model"]:
        raise SystemExit("Hermes session model is empty")
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
