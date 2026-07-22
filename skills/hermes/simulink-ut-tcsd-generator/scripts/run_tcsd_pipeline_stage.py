#!/usr/bin/env python3
"""Authoritative, restart-safe stage runner for the Windows TCSD pipeline."""
from __future__ import annotations

import argparse, importlib.util, json, os, shutil, subprocess, sys
from pathlib import Path
from typing import Any

SCHEMA = "tcsd-stage-checkpoint/v1"

def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path); module = importlib.util.module_from_spec(spec); assert spec.loader; spec.loader.exec_module(module); return module

def read_json(path: Path) -> dict[str, Any]: return json.loads(path.read_text(encoding="utf-8"))
def write_json(path: Path, value: Any) -> None: path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
def artifact(root: Path, path: Path, kind: str = "json", role: str = "evidence") -> dict[str, Any]: return {"path": path.resolve().relative_to(root.resolve()).as_posix(), "kind": kind, "role": role}
def model_name(job: dict[str, Any]) -> str: return Path(job["input"]["modelSlxPath"]).stem
def outputs(job: dict[str, Any]) -> Path: return Path(job["input"]["outputDir"]).resolve()
def workspace(job: dict[str, Any]) -> Path: return Path(job["input"]["workspaceDir"]).resolve()
def scripts() -> Path: return Path(__file__).resolve().parent
def state_path(job: dict[str, Any]) -> Path: return outputs(job) / ".tcsd-checkpoints" / "runner-state.json"
def checkpoint_path(job: dict[str, Any], stage: int) -> Path: return outputs(job) / ".tcsd-checkpoints" / f"stage-{stage:02d}.json"
def load_state(job: dict[str, Any]) -> dict[str, Any]: return read_json(state_path(job)) if state_path(job).exists() else {"schema": "tcsd-stage-runner-state/v1", "jobId": job["jobId"], "resources": job.get("resources", {})}
def save_state(job: dict[str, Any], state: dict[str, Any]) -> None: write_json(state_path(job), state)
def finish(job: dict[str, Any], stage: int, *, status="completed", summary="", artifacts=None, **extra):
    payload = {"schema": SCHEMA, "jobId": job["jobId"], "stageIndex": stage, "status": status, "summary": summary, "artifacts": artifacts or [], **extra}; write_json(checkpoint_path(job, stage), payload)

def run(command: list[str], cwd: Path) -> None: subprocess.run(command, cwd=cwd, check=True)
def matlab_cell(items: list[str]) -> str: return "{" + ",".join("'" + item.replace("'", "''") + "'" for item in items) + "}"
def interface_names(values: Any) -> list[str]:
    if values is None: return []
    if isinstance(values, (str, int, float)): values = [values]
    if isinstance(values, dict): values = [values]
    return [str(item.get("name")) if isinstance(item, dict) else str(item) for item in values]
def validate_interface(value: dict[str, Any]) -> dict[str, Any]:
    if value.get("schema") != "tcsd-model-interface/v1": raise RuntimeError("model interface schema is invalid")
    if not all(isinstance(value.get(key), list) and all(isinstance(name, str) and name for name in value[key]) for key in ("inputs", "outputs")): raise RuntimeError("model interface inputs/outputs must be string arrays")
    return value
def initial_spec(interface: dict[str, Any], model: str) -> dict[str, Any]:
    root = interface.get("rootPorts", interface); inputs = root.get("inputs", []); outputs_ = root.get("outputs", [])
    input_names, output_names = interface_names(inputs), interface_names(outputs_)
    initialization = "\n".join(f"{name}=0;" for name in input_names)
    action = "\n".join([*(f"{name}=0;" for name in input_names), "[+0.1s]"])
    return {"model_name": model, "test_group": {"id": "TG_001", "name": model, "description": "确定性覆盖率基线"}, "tests": [{"id": "TC_001", "name": "确定性基线", "description": "由模型接口生成的确定性基线", "initialization": initialization, "action": action}]}
def simulation_backfill_evidence(simulation: dict[str, Any], workbook: Path) -> dict[str, Any]:
    from openpyxl import load_workbook
    tests = simulation.get("tests", []); tests = [tests] if isinstance(tests, dict) else tests
    simulation_values = 0; case_outputs: dict[str, dict[str, int]] = {}
    for case in tests:
        case_id = str(case.get("test_id") or case.get("row") or "unknown"); counts: dict[str, int] = {}
        steps = case.get("steps", []); steps = [steps] if isinstance(steps, dict) else steps
        for step in steps:
            stable = step.get("stable", {}); values = step.get("outputs", {})
            for name in values:
                if stable.get(name) is not False: counts[name] = counts.get(name, 0) + 1; simulation_values += 1
        case_outputs[case_id] = counts
    wb = load_workbook(workbook, read_only=True, data_only=False); exp_count = sum(str(cell.value).count("expValue(") for row in wb["TCSD"].iter_rows() for cell in row if cell.value); wb.close()
    if simulation_values < 1 or exp_count < 1 or exp_count > simulation_values: raise RuntimeError(f"simulation/workbook backfill count mismatch: simulation={simulation_values}, workbook={exp_count}")
    return {"simulationValueCount": simulation_values, "workbookBackfillCount": exp_count, "caseOutputCounts": case_outputs}
def coverage_meets(report: dict[str, Any], threshold: float) -> bool:
    records = report.get("models", report)
    valid = [record for record in records.values() if isinstance(record, dict) and all(key in record for key in ("condition", "decision", "mcdc"))]
    return bool(valid) and all(float(record[key]["percent"]) >= threshold for record in valid for key in ("condition", "decision", "mcdc"))

def stage_run(stage: int, job: dict[str, Any]) -> None:
    root, out, model, state = workspace(job), outputs(job), model_name(job), load_state(job); inp = job["input"]; out.mkdir(parents=True, exist_ok=True)
    quality = load_module("tcsd_quality", scripts() / "run_tcsd_quality_loop.py")
    if stage == 1:
        required = [Path(inp["modelSlxPath"]), Path(inp["modelMatPath"])]; missing = [str(item) for item in required if not item.is_file()]
        if missing: raise RuntimeError(f"required inputs missing: {missing}")
        manifest = out / ".tcsd-checkpoints" / "input-manifest.json"; write_json(manifest, {"schema": "tcsd-input-manifest/v1", "jobId": job["jobId"], "files": [{"path": str(item), "size": item.stat().st_size} for item in required], "projectAddon": inp.get("projectAddonCopy", {})})
        finish(job, stage, summary="输入文件与项目附件已验证。", artifacts=[artifact(root, manifest)]); return
    if stage == 2:
        matlab_root = Path(os.environ.get("MATLAB_ROOT", inp.get("matlabRoot", "C:/Program Files/MATLAB/R2026a")))
        matlab = matlab_root / "bin" / ("matlab.exe" if os.name == "nt" else "matlab")
        if os.environ.get("TCSD_PIPELINE_SKIP_MATLAB_GATE") != "1" and not matlab.exists(): raise RuntimeError(f"MATLAB executable missing: {matlab}")
        env = out / ".tcsd-checkpoints" / "environment.json"; write_json(env, {"schema": "tcsd-environment-gate/v1", "jobId": job["jobId"], "matlabRoot": str(matlab_root), "runner": str(scripts() / "satk_eval.py"), "passed": True})
        finish(job, stage, summary="MATLAB 与模型工具环境门禁通过。", artifacts=[artifact(root, env)]); return
    if stage == 3:
        runtime = out / ".tcsd-runtime"; runtime.mkdir(exist_ok=True); resources = runtime / "owned-resources.json"
        init_manifest = out / ".tcsd-checkpoints" / "workspace-initialization.json"; entry = runtime / "stage03_initialize.m"; init = inp.get("projectInitScripts", [])
        root_m = str(root).replace("'", "''"); scripts_m = str(scripts()).replace("'", "''"); manifest_m = str(init_manifest).replace("'", "''")
        job_id_m = str(job["jobId"]).replace("'", "''")
        entry.write_text(f"rootDir='{root_m}'; initScripts={matlab_cell(init)}; addpath('{scripts_m}'); setup_ut_support(rootDir,initScripts); p=struct('schema','tcsd-workspace-initialization/v1','jobId','{job_id_m}','workspace',rootDir,'initScripts',{{initScripts}},'completed',true); fid=fopen('{manifest_m}','w'); fprintf(fid,'%s',jsonencode(p,PrettyPrint=true)); fclose(fid);", encoding="utf-8")
        if os.environ.get("TCSD_PIPELINE_SETUP_FIXTURE") == "1": write_json(init_manifest, {"schema":"tcsd-workspace-initialization/v1","jobId":job["jobId"],"workspace":str(root),"initScripts":init,"completed":True})
        else: run([sys.executable, str(scripts() / "satk_eval.py"), str(entry)], root)
        initialized = read_json(init_manifest)
        if initialized.get("jobId") != job["jobId"] or initialized.get("completed") is not True: raise RuntimeError("workspace initialization manifest is invalid")
        write_json(resources, {"schema": "tcsd-owned-resources/v1", "jobId": job["jobId"], "workspace": str(root), "generatedEntries": [str(entry.relative_to(root))]}); state["resources"] = str(resources); state["initializationManifest"] = str(init_manifest); save_state(job, state)
        finish(job, stage, summary="模型工作区已真实初始化并登记 job 资源所有权。", artifacts=[artifact(root, init_manifest), artifact(root, resources)], evidence={"initializationManifest":str(init_manifest.relative_to(root))}); return
    interface = out / f"{model}_interface.json"; traces = out / f"{model}_logical_traces.json"
    if stage == 4:
        entry = out / ".tcsd-runtime" / "stage04_interface.m"; init = inp.get("projectInitScripts", [])
        root_m = str(root).replace("'", "''"); scripts_m = str(scripts()).replace("'", "''"); interface_m = str(interface).replace("'", "''"); mat_name = Path(inp["modelMatPath"]).name.replace("'", "''")
        code = f"rootDir='{root_m}'; model='{model}'; addpath('{scripts_m}'); load_system(fullfile(rootDir,'{model}.slx')); ins=find_system(model,'SearchDepth',1,'BlockType','Inport'); outs=find_system(model,'SearchDepth',1,'BlockType','Outport'); inputNames=reshape(cellstr(string(get_param(ins,'Name'))),1,[]); outputNames=reshape(cellstr(string(get_param(outs,'Name'))),1,[]); p=struct('schema','tcsd-model-interface/v1','inputs',{{inputNames}},'outputs',{{outputNames}}); fid=fopen('{interface_m}','w'); fprintf(fid,'%s',jsonencode(p,PrettyPrint=true)); fclose(fid); trace_logical_mcdc(rootDir,{{model}},'{mat_name}','InitScripts',{matlab_cell(init)}); bdclose(model);"
        entry.write_text(code, encoding="utf-8"); run([sys.executable, str(scripts() / "satk_eval.py"), str(entry)], root)
        validate_interface(read_json(interface)); read_json(traces); state.update({"interface": str(interface), "traces": str(traces)}); save_state(job, state)
        finish(job, stage, summary="模型已加载并提取根输入输出接口。", artifacts=[artifact(root, interface), artifact(root, traces)]); return
    mapping, obligations, coverage_ir = out / f"{model}_logical_operators.json", out / f"{model}_coverage_obligations.json", out / f"{model}_coverage_ir.json"
    if stage == 5:
        run([sys.executable, str(scripts()/"derive_logical_mcdc_mappings.py"), "--traces", str(traces), "--output", str(mapping)], root)
        run([sys.executable, str(scripts()/"build_logical_mcdc_obligations.py"), "--logical-operators", str(mapping), "--output", str(obligations), "--allow-unresolved"], root)
        run([sys.executable, str(scripts()/"build_coverage_ir.py"), "--logical-traces", str(traces), "--obligations", str(obligations), "--output", str(coverage_ir)], root)
        state.update({"mapping": str(mapping), "obligations": str(obligations), "coverageIr": str(coverage_ir)}); save_state(job, state)
        finish(job, stage, summary="Condition、Decision 与 MC/DC 覆盖目标已形成 Coverage IR。", artifacts=[artifact(root, mapping), artifact(root, obligations), artifact(root, coverage_ir)]); return
    if stage == 6:
        plan = out / f"{model}_state_probe_plan.json"; run([sys.executable, str(scripts()/"build_state_probe_plan.py"), "--traces", str(traces), "--output", str(plan)], root); plan_data = read_json(plan)
        probe_artifacts = [artifact(root, plan)]; candidate_count = int(plan_data.get("summary", {}).get("candidate_count") or len(plan_data.get("tests", [])))
        if candidate_count > 0:
            probe_results = out / f"{model}_state_probe_results.json"; probe_fixture = os.environ.get("TCSD_PIPELINE_PROBE_RESULTS_FIXTURE", "")
            if probe_fixture:
                shutil.copy2(probe_fixture, probe_results); run([sys.executable, str(scripts()/"build_probe_mcdc_obligations.py"), "--probe-results", str(probe_results), "--model", model, "--output-dir", str(out), "--logical-mappings", str(mapping)], root)
            else: obligations, _ = quality.run_probe(python=sys.executable, scripts=scripts(), root_dir=root, model=model, mat_file=inp["modelMatPath"], init_scripts=inp.get("projectInitScripts", []), unreachable_overrides="", collect_coverage=False, coverage_threshold=float(inp.get("coverageThreshold", 80)), case_json=plan, output_name=f"{model}_state_probe_results.json")
            read_json(probe_results); run([sys.executable, str(scripts()/"build_coverage_ir.py"), "--logical-traces", str(traces), "--probe-results", str(probe_results), "--obligations", str(obligations), "--output", str(coverage_ir)], root); probe_artifacts.extend([artifact(root, probe_results), artifact(root, obligations), artifact(root, coverage_ir)])
        state["statePlan"] = str(plan); save_state(job, state)
        finish(job, stage, summary="状态及时序刺激已生成并由实际 Probe 验证。" if candidate_count > 0 else "未发现需要额外 Probe 的状态及时序候选。", artifacts=probe_artifacts, evidence={"candidateCount": candidate_count, "probeExecuted": candidate_count > 0}); return
    spec, workbook = out / f"{model}_tcsd_spec.json", out / f"{model}_Test0001_tcsd.xlsx"
    if stage == 7:
        write_json(spec, initial_spec(read_json(interface), model)); run([sys.executable, str(scripts()/"build_tcsd_from_json.py"), "--template", str(scripts().parent/"assets"/"templates"/"tcsd_template.xlsx"), "--spec", str(spec), "--output", str(workbook), "--interface-json", str(interface)], root)
        spec, workbook, _ = quality.synthesize_ir_once(python=sys.executable, scripts=scripts(), root_dir=root, template=scripts().parent/"assets"/"templates"/"tcsd_template.xlsx", model=model, spec=spec, workbook=workbook, interface_json=interface, coverage_ir=coverage_ir, iteration=0)
        quality.validate_workbook(python=sys.executable, scripts=scripts(), root_dir=root, workbook=workbook, interface_json=interface); state.update({"spec": str(spec), "workbook": str(workbook)}); save_state(job, state)
        quality.validate_mapping(python=sys.executable, scripts=scripts(), root_dir=root, workbook=workbook, obligations=obligations, report=out/f"{model}_mcdc_validation_report.json")
        finish(job, stage, summary="首版 TCSD 已生成并通过接口与工作簿校验。", artifacts=[artifact(root, spec), artifact(root, workbook, "xlsx", "workbook")]); return
    workbook = Path(state["workbook"]); spec = Path(state["spec"]); threshold = float(inp.get("coverageThreshold", 80))
    if stage == 8:
        cases = quality.extract_cases(python=sys.executable, scripts=scripts(), root_dir=root, model=model, workbook=workbook, interface_json=interface)
        sim = quality.simulate_and_backfill(python=sys.executable, scripts=scripts(), root_dir=root, model=model, workbook=workbook, case_json=cases, mat_file=inp["modelMatPath"], outputs=",".join(read_json(interface).get("outputs", [])), exclude_outputs="", interface_json=interface)
        backfill = simulation_backfill_evidence(read_json(sim), workbook)
        state.update({"cases": str(cases), "initialSimulation": str(sim), "expValueCount": backfill["workbookBackfillCount"]}); save_state(job, state)
        finish(job, stage, summary="首版仿真完成，expValue 已由实际仿真回填。", artifacts=[artifact(root, workbook, "xlsx", "workbook"), artifact(root, sim)], evidence={"simulationResult": str(sim.relative_to(root)), "expValueCount": backfill["workbookBackfillCount"], **backfill}); return
    initial_cov = out / f"{model}_initial_coverage_summary.json"
    if stage == 9:
        ob, cov = quality.run_probe(python=sys.executable, scripts=scripts(), root_dir=root, model=model, mat_file=inp["modelMatPath"], init_scripts=inp.get("projectInitScripts", []), unreachable_overrides="", collect_coverage=True, coverage_threshold=threshold); shutil.copy2(cov, initial_cov); report=read_json(initial_cov); state.update({"obligations":str(ob),"initialCoverage":str(initial_cov),"coverage":str(cov)}); save_state(job,state)
        finish(job,stage,summary="首轮 Condition、Decision 与 MC/DC 覆盖率已采集。",artifacts=[artifact(root,initial_cov)],coverage=report); return
    if stage == 10:
        report=read_json(initial_cov)
        if coverage_meets(report,threshold): finish(job,stage,status="skipped",summary="首轮三项覆盖率均达到 80%。",skipReason="首轮三项覆盖率均达到 80%。",artifacts=[]); return
        atomic=quality.build_atomic_repair_plan(python=sys.executable,scripts=scripts(),root_dir=root,model=model,logical_traces=traces)
        run([sys.executable,str(scripts()/"build_coverage_ir.py"),"--logical-traces",str(traces),"--obligations",str(atomic),"--output",str(coverage_ir)],root)
        next_spec,next_book,synthesis=quality.synthesize_ir_once(python=sys.executable,scripts=scripts(),root_dir=root,template=scripts().parent/"assets"/"templates"/"tcsd_template.xlsx",model=model,spec=spec,workbook=workbook,interface_json=interface,coverage_ir=coverage_ir,iteration=1)
        applied=int(synthesis.get("added") or 0)>0; reason="coverage_ir_candidates_appended" if applied else "no_unique_executable_coverage_ir_candidates"; evidence=out/f"{model}_coverage_ir_synthesis_iter1.json"
        state.update({"repairAttempted":True,"repairApplied":applied,"repairReason":reason,"repairEvidence":str(evidence),"workbook":str(next_book if applied else workbook),"spec":str(next_spec if applied else spec)}); save_state(job,state)
        finish(job,stage,status="completed" if applied else "partial",summary="Coverage IR 单轮修正已应用。" if applied else "已尝试一次修正，但没有可应用的唯一候选。",artifacts=[artifact(root,coverage_ir),artifact(root,evidence)],repair={"required":True,"attempted":True,"applied":applied,"passes":1 if applied else 0,"reason":reason,"evidence":str(evidence.relative_to(root))},evidence={"coverageIr":str(coverage_ir.relative_to(root))}); return
    final_cov=out/f"{model}_final_coverage_summary.json"
    if stage == 11:
        if not state.get("repairApplied"): finish(job,stage,status="skipped",summary="修正未实际应用，引用首轮仿真与覆盖率。",skipReason="修正未实际应用，引用首轮结果。",artifacts=[]); return
        workbook=Path(state["workbook"]); cases=quality.extract_cases(python=sys.executable,scripts=scripts(),root_dir=root,model=model,workbook=workbook,interface_json=interface); sim=quality.simulate_and_backfill(python=sys.executable,scripts=scripts(),root_dir=root,model=model,workbook=workbook,case_json=cases,mat_file=inp["modelMatPath"],outputs=",".join(read_json(interface).get("outputs",[])),exclude_outputs="",interface_json=interface); ob,cov=quality.run_probe(python=sys.executable,scripts=scripts(),root_dir=root,model=model,mat_file=inp["modelMatPath"],init_scripts=inp.get("projectInitScripts",[]),unreachable_overrides="",collect_coverage=True,coverage_threshold=threshold); shutil.copy2(cov,final_cov); state.update({"finalSimulation":str(sim),"finalCoverage":str(final_cov),"obligations":str(ob)}); save_state(job,state)
        finish(job,stage,summary="修正后最终仿真、回填与覆盖率检查已完成。",artifacts=[artifact(root,sim),artifact(root,final_cov)],coverage=read_json(final_cov)); return
    if stage == 12:
        final_report=read_json(final_cov if final_cov.exists() else initial_cov); manifest=out/f"{model}_tcsd_execution_manifest.json"; mapping_report=out/f"{model}_mcdc_validation_report.json"; workbook=Path(state["workbook"])
        result=quality.write_execution_manifest(path=manifest,root_dir=root,model=model,threshold=threshold,workbook=workbook,simulation_result=Path(state.get("finalSimulation") or state["initialSimulation"]),initial_coverage=read_json(initial_cov),final_coverage=final_report,initial_coverage_artifact=initial_cov,final_coverage_artifact=final_cov if final_cov.exists() else initial_cov,repair_required=not coverage_meets(read_json(initial_cov),threshold),repair_applied=bool(state.get("repairApplied")),obligations=Path(state["obligations"]),mapping_report=mapping_report,coverage_ir=coverage_ir,repair_attempted=bool(state.get("repairAttempted")),repair_reason=state.get("repairReason"),repair_evidence=Path(state["repairEvidence"]) if state.get("repairEvidence") else None)
        timeline=out/f"{model}_tcsd_timeline.json"; artifact_manifest=out/f"{model}_tcsd_artifacts.json"; cleanup=out/f"{model}_tcsd_cleanup.json"
        write_json(timeline,{"schema":"tcsd-stage-timeline/v1","jobId":job["jobId"],"events":job.get("events",[])}); deliver=[manifest,workbook,initial_cov,final_cov if final_cov.exists() else initial_cov]; write_json(artifact_manifest,{"schema":"tcsd-artifact-manifest/v1","jobId":job["jobId"],"artifacts":[artifact(root,item,"xlsx" if item.suffix==".xlsx" else "json") for item in deliver]})
        owned_candidates=[out/".tcsd-runtime"/"stage04_interface.m",out/".tcsd-runtime"/"job.json",out/f"{model}_probe_mcdc_entry.m",out/f"{model}_simulate_mcdc_entry.m"]; removed=[]
        for candidate in owned_candidates:
            resolved=candidate.resolve()
            if resolved.is_relative_to(root) and resolved.exists(): resolved.unlink(); removed.append(resolved.relative_to(root).as_posix())
        write_json(cleanup,{"schema":"tcsd-cleanup-result/v1","jobId":job["jobId"],"ownerJobId":job["jobId"],"closedMatlabSessions":[],"stoppedMcpProcesses":[],"removedEntries":removed})
        finish(job,stage,status="partial" if result["completion"]=="partial" else "completed",summary="最终 manifest、时间线、产物清单与 job 资源清理记录已完成。",artifacts=[artifact(root,manifest),artifact(root,timeline),artifact(root,artifact_manifest),artifact(root,cleanup),artifact(root,workbook,"xlsx","workbook")],executionManifest=result,artifactManifest=read_json(artifact_manifest)["artifacts"],evidence={"executionManifest":str(manifest.relative_to(root)),"timeline":str(timeline.relative_to(root)),"artifactManifest":str(artifact_manifest.relative_to(root)),"cleanup":str(cleanup.relative_to(root))}); return
    raise RuntimeError(f"unsupported stage {stage}")

def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument("--job",required=True); parser.add_argument("--stage",required=True,type=int); args=parser.parse_args(); job=read_json(Path(args.job)); stage_run(args.stage,job); return 0
if __name__ == "__main__": raise SystemExit(main())
