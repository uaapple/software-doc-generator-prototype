#!/usr/bin/env python3
"""Read non-sensitive model/token telemetry for one Hermes session."""
from __future__ import annotations

import argparse
import json
import sqlite3
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
    args = parser.parse_args()
    database = Path(args.state_db).resolve()
    if not database.is_file():
        raise SystemExit("Hermes state database does not exist")
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
    finally:
        connection.close()
    if row is None:
        raise SystemExit("Hermes session telemetry was not found")
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
    }
    if not payload["model"]:
        raise SystemExit("Hermes session model is empty")
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
