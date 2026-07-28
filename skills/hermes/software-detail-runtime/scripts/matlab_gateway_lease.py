#!/usr/bin/env python3
"""Evaluate MATLAB code through an existing task-owned Gateway lease."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import List, Optional
from urllib import error, parse, request


TERMINAL_JOB_STATUSES = {"succeeded", "failed", "cancelled", "timed_out"}


class GatewayError(RuntimeError):
    """Safe, credential-free Gateway failure."""


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run one MATLAB code file through an existing MATLAB Gateway lease."
    )
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--lease-id", required=True)
    parser.add_argument("--owner-job-id", required=True)
    parser.add_argument("--code-file", required=True, type=Path)
    parser.add_argument("--timeout-seconds", type=float, default=600.0)
    parser.add_argument("--poll-interval-seconds", type=float, default=0.2)
    return parser.parse_args(argv)


def required_environment(name: str, *fallback_names: str) -> str:
    for candidate in (name, *fallback_names):
        value = os.environ.get(candidate, "").strip()
        if value:
            return value
    raise GatewayError(f"required Gateway environment is unavailable: {name}")


class GatewayLeaseClient:
    def __init__(self) -> None:
        self.base_url = required_environment("SATK_GATEWAY_URL", "MATLAB_MCP_BASE_URL").rstrip("/")
        self.auth_token = required_environment("MATLAB_MCP_AUTH_TOKEN", "MATLAB_GATEWAY_TOKEN")
        self.evaluate_token = required_environment("MATLAB_GATEWAY_EVALUATE_TOKEN")

    def json_request(
        self,
        method: str,
        route: str,
        body: Optional[dict[str, object]] = None,
        *,
        evaluate: bool = False,
        timeout: float = 30.0,
    ) -> dict[str, object]:
        encoded = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.auth_token}",
        }
        if encoded is not None:
            headers["Content-Type"] = "application/json"
        if evaluate:
            headers["x-sdg-evaluate-token"] = self.evaluate_token
            headers["x-sdg-gateway-caller"] = "software-detail-runtime"
        http_request = request.Request(
            f"{self.base_url}{route}",
            data=encoded,
            headers=headers,
            method=method,
        )
        try:
            with request.urlopen(http_request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
        except error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw)
                code = payload.get("error", {}).get("code", f"HTTP_{exc.code}")
                message = payload.get("error", {}).get("message", "MATLAB Gateway request failed.")
            except (json.JSONDecodeError, AttributeError):
                code = f"HTTP_{exc.code}"
                message = "MATLAB Gateway returned an unreadable error response."
            raise GatewayError(f"{code}: {message}") from None
        except (error.URLError, TimeoutError) as exc:
            reason = getattr(exc, "reason", None)
            category = type(reason or exc).__name__
            raise GatewayError(f"MATLAB Gateway request failed: {category}") from None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            raise GatewayError("MATLAB Gateway returned non-JSON.") from None
        if not isinstance(payload, dict):
            raise GatewayError("MATLAB Gateway returned a non-object JSON payload.")
        return payload


def run_evaluation(args: argparse.Namespace) -> dict[str, object]:
    if args.timeout_seconds <= 0:
        raise GatewayError("--timeout-seconds must be positive")
    if args.poll_interval_seconds <= 0:
        raise GatewayError("--poll-interval-seconds must be positive")
    code = args.code_file.read_text(encoding="utf-8")
    if not code.strip():
        raise GatewayError("MATLAB code file is empty.")

    client = GatewayLeaseClient()
    asset_id = f"code-{uuid.uuid4()}"
    job_id = f"eval-{uuid.uuid4()}"
    workspace_id = parse.quote(args.workspace_id, safe="")
    lease_id = parse.quote(args.lease_id, safe="")

    lease = client.json_request(
        "GET",
        f"/api/workspaces/{workspace_id}/leases/{lease_id}",
    )
    if (
        lease.get("status") != "active"
        or lease.get("ownerJobId") != args.owner_job_id
    ):
        raise GatewayError("MATLAB Gateway lease is unavailable or owned by another job.")

    client.json_request(
        "PUT",
        f"/api/workspaces/{workspace_id}/assets/{parse.quote(asset_id, safe='')}/text",
        {"fileName": f"{asset_id}.m", "content": code},
    )
    client.json_request(
        "POST",
        f"/api/jobs/{parse.quote(job_id, safe='')}",
        {
            "workspaceId": args.workspace_id,
            "leaseId": args.lease_id,
            "ownerJobId": args.owner_job_id,
            "operation": "evaluate_matlab_code",
            "inputAssetId": asset_id,
            "timeoutMs": max(1000, int(args.timeout_seconds * 1000)),
        },
        evaluate=True,
    )

    deadline = time.monotonic() + args.timeout_seconds
    job: dict[str, object] = {}
    while time.monotonic() < deadline:
        query = parse.urlencode({"workspaceId": args.workspace_id})
        job = client.json_request(
            "GET",
            f"/api/jobs/{parse.quote(job_id, safe='')}?{query}",
        )
        if job.get("status") in TERMINAL_JOB_STATUSES:
            break
        time.sleep(args.poll_interval_seconds)
    else:
        client.json_request(
            "POST",
            f"/api/jobs/{parse.quote(job_id, safe='')}/cancel",
            {"workspaceId": args.workspace_id},
        )
        raise GatewayError("MATLAB Gateway evaluation timed out.")

    if job.get("status") != "succeeded":
        failure = job.get("error") if isinstance(job.get("error"), dict) else {}
        code = failure.get("code", "MATLAB_GATEWAY_JOB_FAILED")
        message = failure.get("message", f"MATLAB Gateway job {job.get('status', 'failed')}.")
        raise GatewayError(f"{code}: {message}")
    artifact_id = str(job.get("artifactId") or "")
    if not artifact_id:
        raise GatewayError("MATLAB Gateway job succeeded without an artifact.")
    return client.json_request(
        "GET",
        (
            f"/api/workspaces/{workspace_id}/artifacts/"
            f"{parse.quote(artifact_id, safe='')}"
        ),
    )


def main(argv: Optional[List[str]] = None) -> int:
    try:
        artifact = run_evaluation(parse_args(argv))
        print(json.dumps(artifact, ensure_ascii=False))
        return 0
    except (GatewayError, OSError, UnicodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
