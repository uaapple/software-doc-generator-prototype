#!/usr/bin/env python3
"""Deterministic wrapper for probe_block_inputs_with_params.m.

Runs a `simulink-ut-block-input-probe-request/v1` scenario set through the
MATLAB/SATK bridge and writes a `simulink-ut-block-input-probe/v1` result.

This is the reusable counterpart of the hand-written local probe scripts the
agent used to produce during stage 10: parameter overrides applied on the MAT
base-workspace objects, per-block input-port observation via temporary
To-Workspace probes, ordered delay steps, and root-Outport sampling.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True, help="Task workspace root (contains model slx/mat)")
    parser.add_argument("--model", required=True, help="Model base name")
    parser.add_argument("--mat", required=True, help="MAT file name (model workspace data)")
    parser.add_argument("--request", required=True, help="simulink-ut-block-input-probe-request/v1 JSON")
    parser.add_argument("--output", required=True, help="Result JSON output path")
    parser.add_argument("--scripts", default="", help="tcsd-runtime scripts dir (defaults to this file's dir)")
    parser.add_argument("--init-scripts", default="", help="Comma-separated model init scripts")
    args = parser.parse_args()

    scripts = Path(args.scripts) if args.scripts else Path(__file__).resolve().parent
    workspace = Path(args.workspace).resolve()
    request = json.loads(Path(args.request).read_text(encoding="utf-8"))
    if request.get("schema") != "simulink-ut-block-input-probe-request/v1":
        print("probe request schema is invalid", file=sys.stderr)
        return 2

    init_scripts = [item.strip() for item in args.init_scripts.split(",") if item.strip()]
    cell = "{" + ",".join("'" + item.replace("'", "''") + "'" for item in init_scripts) + "}"
    request_path = Path(args.request).resolve()
    output_path = Path(args.output).resolve()
    entry = output_path.parent / f"{args.model}_block_input_probe_entry.m"
    entry.parent.mkdir(parents=True, exist_ok=True)
    code = (
        f"rootDir='{str(workspace).replace(chr(39), chr(39)+chr(39))}'; "
        f"initScripts={cell}; "
        f"addpath('{str(scripts).replace(chr(39), chr(39)+chr(39))}'); "
        f"setup_ut_support(rootDir,initScripts); "
        f"probe_block_inputs_with_params(rootDir,'{args.model.replace(chr(39), chr(39)+chr(39))}',"
        f"'{args.mat.replace(chr(39), chr(39)+chr(39))}',initScripts,"
        f"'{str(request_path).replace(chr(39), chr(39)+chr(39))}',"
        f"'{str(output_path).replace(chr(39), chr(39)+chr(39))}');"
    )
    entry.write_text(code, encoding="utf-8")

    satk = scripts / "satk_eval.py"
    if not satk.is_file():
        print(f"SATK runner missing: {satk}", file=sys.stderr)
        return 2
    import subprocess
    try:
        subprocess.run([sys.executable, str(satk), str(entry)], cwd=workspace, check=True,
                       capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        detail = (error.stdout or "").strip()[-1500:] or (error.stderr or "").strip()[-1500:]
        print(f"probe_block_inputs: SATK/MATLAB failed: {detail}", file=sys.stderr)
        return 1

    if not output_path.is_file():
        print(f"probe_block_inputs: result file not produced: {output_path}", file=sys.stderr)
        return 1
    result = json.loads(output_path.read_text(encoding="utf-8"))
    if result.get("schema") != "simulink-ut-block-input-probe/v1":
        print("probe_block_inputs: result schema invalid", file=sys.stderr)
        return 1
    print(json.dumps({"output": str(output_path), "scenarioCount": len(result.get("scenarios", []))}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
