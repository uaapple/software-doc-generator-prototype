#!/usr/bin/env python3
"""Call Simulink Agentic Toolkit's evaluate_matlab_code over MCP stdio."""

from __future__ import annotations

import json
import hashlib
import os
import platform
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


def executable_name(name: str) -> str:
    return f"{name}.exe" if platform.system() == "Windows" else name


def server_binary_names(platform_name=None) -> tuple[str, str]:
    suffix = ".exe" if (platform_name or platform.system()) == "Windows" else ""
    return f"matlab-mcp-server{suffix}", f"matlab-mcp-core-server{suffix}"


def server_candidates(
    *,
    environ=None,
    home=None,
    cwd=None,
    script_file=None,
    platform_name=None,
) -> list[tuple[str, Path]]:
    values = os.environ if environ is None else environ
    home_dir = Path.home() if home is None else Path(home)
    working_dir = Path.cwd() if cwd is None else Path(cwd)
    source_file = Path(__file__).resolve() if script_file is None else Path(script_file).resolve()
    official_name, legacy_name = server_binary_names(platform_name)
    candidates: list[tuple[str, Path]] = []
    explicit = str(values.get("SATK_MCP_SERVER") or "").strip()
    if explicit:
        candidates.append(("environment", Path(explicit).expanduser()))
    toolkit_bin = home_dir / ".matlab" / "agentic-toolkits" / "bin"
    candidates.extend([
        ("official-toolkit", toolkit_bin / official_name),
        ("legacy-toolkit", toolkit_bin / legacy_name),
    ])
    repository_roots = [working_dir]
    if len(source_file.parents) > 4:
        repository_roots.append(source_file.parents[4])
    for repository_root in repository_roots:
        candidates.extend([
            ("repository-tools-official", repository_root / "tools" / official_name),
            ("repository-tools-legacy", repository_root / "tools" / legacy_name),
        ])
    unique: list[tuple[str, Path]] = []
    seen: set[Path] = set()
    for source, candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append((source, resolved))
    return unique


def resolve_server(**kwargs) -> tuple[Path, str]:
    candidates = server_candidates(**kwargs)
    for source, candidate in candidates:
        if candidate.is_file():
            return candidate, source
    searched = ", ".join(str(candidate) for _, candidate in candidates)
    raise FileNotFoundError(f"SATK MCP server not found; searched: {searched}")


def gateway_url(environ=None) -> str:
    values = os.environ if environ is None else environ
    return str(values.get("SATK_GATEWAY_URL") or "").strip().rstrip("/")


def gateway_headers(environ=None) -> dict[str, str]:
    values = os.environ if environ is None else environ
    headers = {"Content-Type": "application/json"}
    token = str(values.get("MATLAB_MCP_AUTH_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def gateway_request(
    method: str,
    route: str,
    *,
    payload: dict | None = None,
    environ=None,
    timeout_s: float = 30.0,
) -> dict:
    base_url = gateway_url(environ)
    if not base_url:
        raise RuntimeError("SATK_GATEWAY_URL is not configured")
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{route}",
        data=body,
        headers=gateway_headers(environ),
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        response_text = exc.read().decode("utf-8", errors="replace")
        try:
            response = json.loads(response_text)
            message = response.get("error", {}).get("message") or response_text
            code = response.get("error", {}).get("code") or f"HTTP_{exc.code}"
        except json.JSONDecodeError:
            message = response_text or str(exc)
            code = f"HTTP_{exc.code}"
        raise RuntimeError(f"MATLAB Gateway {code}: {message}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"MATLAB Gateway is unavailable: {exc.reason}") from exc


def server_info(**kwargs) -> dict[str, object]:
    values = kwargs.get("environ")
    if gateway_url(values):
        version = gateway_request("GET", "/version", environ=values)
        return {
            "discovery": "matlab-gateway",
            "gatewayUrl": gateway_url(values),
            "gatewayVersion": version.get("gatewayVersion", "unknown"),
            "matlabRelease": version.get("matlabRelease", "unknown"),
            "matlabMcpVersion": version.get("matlabMcpVersion", "unknown"),
            "satkVersion": version.get("satkVersion", "unknown"),
        }
    server, source = resolve_server(**kwargs)
    digest = hashlib.sha256()
    with server.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "path": str(server),
        "discovery": source,
        "sha256": digest.hexdigest(),
        "sizeBytes": server.stat().st_size,
    }


def default_log_folder() -> str:
    if platform.system() == "Windows":
        return r"C:\Temp\matlab-mcp-core-server-codex"
    if platform.system() == "Darwin":
        return "/private/tmp/matlab-mcp-core-server-codex"
    return str(Path(tempfile.gettempdir()) / "matlab-mcp-core-server-codex")


DEFAULT_EXTENSION = (
    Path(os.environ["SATK_MCP_EXTENSION"])
    if os.environ.get("SATK_MCP_EXTENSION")
    else Path.home() / ".matlab" / "agentic-toolkits" / "simulink" / "tools" / "tools.json"
)
DEDICATED_WORKER = os.environ.get("TCSD_DEDICATED_WORKER", "").lower() in {"1", "true", "yes", "on"}
CLEAN_STALE_MCP = DEDICATED_WORKER or os.environ.get("TCSD_CLEAN_STALE_MCP", "").lower() in {"1", "true", "yes", "on"}
SESSION_MODE = os.environ.get("SATK_MATLAB_SESSION_MODE", "new" if DEDICATED_WORKER else "existing")
MATLAB_ROOT = os.environ.get("SATK_MATLAB_ROOT", "")
LOG_FOLDER = Path(os.environ.get("SATK_MCP_LOG_FOLDER", default_log_folder()))


def send(proc: subprocess.Popen[str], msg: dict) -> None:
    assert proc.stdin is not None
    proc.stdin.write(json.dumps(msg, ensure_ascii=False) + "\n")
    proc.stdin.flush()


def read_json(proc: subprocess.Popen[str], timeout_s: float = 120.0) -> dict:
    assert proc.stdout is not None
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                err = ""
                try:
                    if proc.stderr is not None:
                        err = proc.stderr.read()
                except Exception:
                    err = ""
                raise RuntimeError(f"MCP server exited with code {proc.returncode}\n{err}")
            time.sleep(0.1)
            continue
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            print(line, file=sys.stderr)
    raise TimeoutError("Timed out waiting for MCP response")


def wait_for_id(proc: subprocess.Popen[str], msg_id: int, timeout_s: float = 180.0) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        msg = read_json(proc, max(1.0, deadline - time.monotonic()))
        if msg.get("id") == msg_id:
            return msg
    raise TimeoutError(f"Timed out waiting for MCP response id={msg_id}")


def mcp_response_failed(message: dict) -> bool:
    if "error" in message:
        return True
    result = message.get("result")
    return isinstance(result, dict) and result.get("isError") is True


def mirror_runtime_matlab_scripts(code: str, *, environ=None) -> str:
    values = os.environ if environ is None else environ
    container_root_text = str(
        values.get("MATLAB_GATEWAY_CONTAINER_ROOT") or "/var/lib/sdg/data"
    ).strip()
    container_root = Path(container_root_text).resolve()
    source_dir = Path(__file__).resolve().parent
    matlab_sources = sorted(source_dir.glob("*.m"))
    digest = hashlib.sha256()
    for source in matlab_sources:
        digest.update(source.name.encode("utf-8"))
        digest.update(source.read_bytes())
    mirror_dir = (
        container_root
        / ".matlab-gateway-runtime"
        / digest.hexdigest()
        / "scripts"
    )
    mirror_dir.mkdir(parents=True, exist_ok=True)
    for source in matlab_sources:
        target = mirror_dir / source.name
        if not target.exists() or target.read_bytes() != source.read_bytes():
            shutil.copy2(source, target)
    return code.replace(str(source_dir), str(mirror_dir))


def evaluate_over_gateway(code_file: Path, *, environ=None) -> dict:
    values = os.environ if environ is None else environ
    mapping_id = str(values.get("SATK_GATEWAY_MAPPING_ID") or "worker-data").strip()
    workspace_id = f"satk-{uuid.uuid4().hex}"
    asset_id = "matlab-code"
    job_id = f"eval-{uuid.uuid4().hex}"
    timeout_s = max(1.0, float(values.get("SATK_GATEWAY_TIMEOUT_SECONDS") or 600))
    code = mirror_runtime_matlab_scripts(code_file.read_text(encoding="utf-8"), environ=values)
    workspace_route = f"/api/workspaces/{urllib.parse.quote(workspace_id)}"
    job_route = f"/api/jobs/{urllib.parse.quote(job_id)}"
    query = urllib.parse.urlencode({"workspaceId": workspace_id})
    created = False
    try:
        gateway_request(
            "PUT",
            workspace_route,
            payload={"mappingId": mapping_id},
            environ=values,
        )
        created = True
        gateway_request(
            "PUT",
            f"{workspace_route}/assets/{asset_id}/text",
            payload={"fileName": code_file.name, "content": code},
            environ=values,
        )
        gateway_request(
            "POST",
            job_route,
            payload={
                "workspaceId": workspace_id,
                "operation": "evaluate_matlab_code",
                "inputAssetId": asset_id,
                "timeoutMs": int(timeout_s * 1000),
            },
            environ=values,
        )
        deadline = time.monotonic() + timeout_s + 10.0
        while time.monotonic() < deadline:
            job = gateway_request(
                "GET",
                f"{job_route}?{query}",
                environ=values,
            )
            status = job.get("status")
            if status == "succeeded":
                artifact_id = urllib.parse.quote(str(job.get("artifactId") or ""))
                artifact = gateway_request(
                    "GET",
                    f"{workspace_route}/artifacts/{artifact_id}",
                    environ=values,
                )
                return {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "result": artifact.get("result"),
                }
            if status in {"failed", "cancelled", "timed_out"}:
                error = job.get("error") or {}
                return {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "error": {
                        "code": error.get("code") or "MATLAB_GATEWAY_JOB_FAILED",
                        "message": error.get("message") or f"MATLAB Gateway job {status}",
                    },
                }
            time.sleep(0.2)
        gateway_request(
            "POST",
            f"{job_route}/cancel",
            payload={"workspaceId": workspace_id},
            environ=values,
        )
        return {
            "jsonrpc": "2.0",
            "id": 2,
            "error": {
                "code": "MATLAB_GATEWAY_POLL_TIMEOUT",
                "message": f"Timed out waiting for MATLAB Gateway after {timeout_s:g}s",
            },
        }
    finally:
        if created:
            try:
                gateway_request("DELETE", workspace_route, environ=values)
            except RuntimeError:
                pass


def process_rows() -> list[tuple[int, str]]:
    if platform.system() == "Windows":
        return windows_process_rows()
    try:
        completed = subprocess.run(
            ["ps", "-eo", "pid=,command="],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except Exception:
        return []
    rows: list[tuple[int, str]] = []
    for line in completed.stdout.splitlines():
        parts = line.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            rows.append((int(parts[0]), parts[1]))
        except ValueError:
            continue
    return rows


def windows_process_rows() -> list[tuple[int, str]]:
    commands = [
        [
            "wmic",
            "process",
            "where",
            "name='matlab-mcp-server.exe' or name='matlab-mcp-core-server.exe'",
            "get",
            "ProcessId,CommandLine",
            "/FORMAT:CSV",
        ],
        [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                "Get-CimInstance Win32_Process -Filter "
                "\"name='matlab-mcp-server.exe' OR name='matlab-mcp-core-server.exe'\" | "
                "ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"
            ),
        ],
    ]
    for command in commands:
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except Exception:
            continue
        rows = parse_windows_process_output(completed.stdout)
        if rows:
            return rows
    return []


def parse_windows_process_output(output: str) -> list[tuple[int, str]]:
    rows: list[tuple[int, str]] = []
    for line in output.splitlines():
        line = line.strip()
        if not line or "CommandLine" in line and "ProcessId" in line:
            continue
        if "|" in line:
            pid_text, command = line.split("|", 1)
        else:
            parts = line.rsplit(",", 1)
            if len(parts) != 2:
                continue
            command, pid_text = parts
        try:
            rows.append((int(pid_text.strip()), command.strip()))
        except ValueError:
            continue
    return rows


def command_matches_task_mcp(command: str) -> bool:
    lower = command.lower()
    server_names = {name.lower() for name in server_binary_names()}
    log_folder = str(LOG_FOLDER).lower()
    alt_log_folder = log_folder.replace("\\", "/")
    return any(name in lower for name in server_names) and (log_folder in lower or alt_log_folder in lower)


def terminate_process(pid: int) -> bool:
    if pid == os.getpid():
        return False
    try:
        if platform.system() == "Windows":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False, capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
        return True
    except Exception:
        return False


def clean_stale_mcp_processes() -> None:
    if not CLEAN_STALE_MCP:
        return
    terminated: list[int] = []
    for pid, command in process_rows():
        if command_matches_task_mcp(command) and terminate_process(pid):
            terminated.append(pid)
    if terminated:
        print(
            f"terminated stale task-owned MATLAB MCP server processes: {terminated}",
            file=sys.stderr,
        )


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--server-info":
        try:
            print(json.dumps(server_info(), ensure_ascii=False))
            return 0
        except FileNotFoundError as exc:
            print(str(exc), file=sys.stderr)
            return 1
    if len(sys.argv) != 2:
        print("usage: satk_eval.py MATLAB_CODE_FILE | --server-info", file=sys.stderr)
        return 2

    code_file = Path(sys.argv[1])
    if gateway_url():
        try:
            result = evaluate_over_gateway(code_file)
        except (OSError, RuntimeError, ValueError) as exc:
            result = {
                "jsonrpc": "2.0",
                "id": 2,
                "error": {
                    "code": "MATLAB_GATEWAY_REQUEST_FAILED",
                    "message": str(exc),
                },
            }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if mcp_response_failed(result) else 0

    try:
        selected_server, _ = resolve_server()
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if not DEFAULT_EXTENSION.exists():
        print(f"SATK MCP extension file not found: {DEFAULT_EXTENSION}", file=sys.stderr)
        return 1

    code = code_file.read_text(encoding="utf-8")
    LOG_FOLDER.mkdir(parents=True, exist_ok=True)
    clean_stale_mcp_processes()
    command = [
        str(selected_server),
        f"--matlab-session-mode={SESSION_MODE}",
        f"--log-folder={LOG_FOLDER}",
        f"--extension-file={DEFAULT_EXTENSION}",
    ]
    if SESSION_MODE != "existing" and MATLAB_ROOT:
        command.append(f"--matlab-root={MATLAB_ROOT}")

    proc = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    try:
        send(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "codex-satk-eval", "version": "0.1"},
                },
            },
        )
        init = wait_for_id(proc, 1, 120.0)
        if mcp_response_failed(init):
            print(json.dumps(init, ensure_ascii=False, indent=2))
            return 1

        send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        send(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "evaluate_matlab_code",
                    "arguments": {"code": code},
                },
            },
        )
        result = wait_for_id(proc, 2, 600.0)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if mcp_response_failed(result) else 0
    finally:
        try:
            if proc.stdin:
                proc.stdin.close()
        finally:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
