#!/usr/bin/env python3
"""Call Simulink Agentic Toolkit's evaluate_matlab_code over MCP stdio."""

from __future__ import annotations

import json
import os
import platform
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def executable_name(name: str) -> str:
    return f"{name}.exe" if platform.system() == "Windows" else name


def default_log_folder() -> str:
    if platform.system() == "Windows":
        return r"C:\Temp\matlab-mcp-core-server-codex"
    if platform.system() == "Darwin":
        return "/private/tmp/matlab-mcp-core-server-codex"
    return str(Path(tempfile.gettempdir()) / "matlab-mcp-core-server-codex")


DEFAULT_SERVER = (
    Path(os.environ["SATK_MCP_SERVER"])
    if os.environ.get("SATK_MCP_SERVER")
    else Path.home() / ".matlab" / "agentic-toolkits" / "bin" / executable_name("matlab-mcp-core-server")
)
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
            "name='matlab-mcp-core-server.exe'",
            "get",
            "ProcessId,CommandLine",
            "/FORMAT:CSV",
        ],
        [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                "Get-CimInstance Win32_Process -Filter \"name='matlab-mcp-core-server.exe'\" | "
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
    server_name = executable_name("matlab-mcp-core-server").lower()
    log_folder = str(LOG_FOLDER).lower()
    alt_log_folder = log_folder.replace("\\", "/")
    return server_name in lower and (log_folder in lower or alt_log_folder in lower)


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
            f"terminated stale task-owned matlab-mcp-core-server processes: {terminated}",
            file=sys.stderr,
        )


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: satk_eval.py MATLAB_CODE_FILE", file=sys.stderr)
        return 2

    if not DEFAULT_SERVER.exists():
        print(f"SATK MCP server not found: {DEFAULT_SERVER}", file=sys.stderr)
        return 1
    if not DEFAULT_EXTENSION.exists():
        print(f"SATK MCP extension file not found: {DEFAULT_EXTENSION}", file=sys.stderr)
        return 1

    code = Path(sys.argv[1]).read_text(encoding="utf-8")
    LOG_FOLDER.mkdir(parents=True, exist_ok=True)
    clean_stale_mcp_processes()
    command = [
        str(DEFAULT_SERVER),
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
        if "error" in init:
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
        return 1 if "error" in result else 0
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
