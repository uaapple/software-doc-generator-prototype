import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_tcsd_pipeline_stage.py"
SPEC = importlib.util.spec_from_file_location("run_tcsd_pipeline_stage", SCRIPT)
RUNNER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(RUNNER)


class PipelineStageRunnerTests(unittest.TestCase):
    def test_first_three_stages_write_owned_authoritative_checkpoints(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "outputs"
            model = root / "GenericModel.slx"
            mat = root / "GenericModel.mat"
            model.write_bytes(b"slx")
            mat.write_bytes(b"mat")
            job = {
                "jobId": "job-generic",
                "events": [],
                "resources": {"ownerJobId": "job-generic"},
                "input": {
                    "workspaceDir": str(root),
                    "outputDir": str(output),
                    "modelSlxPath": str(model),
                    "modelMatPath": str(mat),
                    "projectAddonCopy": {"copiedFileCount": 0},
                },
            }
            old = os.environ.get("TCSD_PIPELINE_SKIP_MATLAB_GATE")
            os.environ["TCSD_PIPELINE_SKIP_MATLAB_GATE"] = "1"
            try:
                for stage in (1, 2, 3):
                    RUNNER.stage_run(stage, job)
                    checkpoint = json.loads((output / ".tcsd-checkpoints" / f"stage-{stage:02d}.json").read_text(encoding="utf-8"))
                    self.assertEqual(checkpoint["schema"], "tcsd-stage-checkpoint/v1")
                    self.assertEqual(checkpoint["jobId"], "job-generic")
                    self.assertEqual(checkpoint["stageIndex"], stage)
                    self.assertTrue(checkpoint["artifacts"])
                resources = json.loads((output / ".tcsd-runtime" / "owned-resources.json").read_text(encoding="utf-8"))
                self.assertEqual(resources["jobId"], "job-generic")
            finally:
                if old is None:
                    os.environ.pop("TCSD_PIPELINE_SKIP_MATLAB_GATE", None)
                else:
                    os.environ["TCSD_PIPELINE_SKIP_MATLAB_GATE"] = old

    def test_coverage_threshold_uses_all_three_metrics_for_every_model(self):
        report = {"M1": {"condition": {"percent": 90}, "decision": {"percent": 90}, "mcdc": {"percent": 79}}}
        self.assertFalse(RUNNER.coverage_meets(report, 80))
        report["M1"]["mcdc"]["percent"] = 80
        self.assertTrue(RUNNER.coverage_meets(report, 80))


if __name__ == "__main__":
    unittest.main()
