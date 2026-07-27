import importlib.util
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock


SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "skills"
    / "hermes"
    / "tcsd-runtime"
    / "scripts"
    / "satk_eval.py"
)
SPEC = importlib.util.spec_from_file_location("satk_eval_gateway_test", SCRIPT)
SATK = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(SATK)


class SatkGatewayTests(unittest.TestCase):
    def test_gateway_evaluate_headers_use_separate_scoped_token(self):
        headers = SATK.gateway_headers(
            {
                "MATLAB_MCP_AUTH_TOKEN": "api-token",
                "MATLAB_GATEWAY_EVALUATE_TOKEN": "evaluate-token",
            }
        )
        self.assertEqual(headers["Authorization"], "Bearer api-token")
        self.assertEqual(headers["X-SDG-Evaluate-Token"], "evaluate-token")
        self.assertEqual(headers["X-SDG-Gateway-Caller"], "tcsd-runtime")

    def test_gateway_unavailable_is_a_public_runtime_error(self):
        with mock.patch.dict(
            os.environ,
            {"SATK_GATEWAY_URL": "http://host.docker.internal:5100"},
            clear=True,
        ):
            with mock.patch.object(
                SATK.urllib.request,
                "urlopen",
                side_effect=urllib.error.URLError("offline fixture"),
            ):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "MATLAB Gateway is unavailable",
                ):
                    SATK.gateway_request("GET", "/health")

    def test_runtime_matlab_helpers_are_mirrored_without_support_package(self):
        with tempfile.TemporaryDirectory() as temp:
            container_root = Path(temp) / "worker-data"
            source_dir = SCRIPT.parent
            code = f"addpath('{source_dir}'); setup_ut_support('/workspace',{{}});"
            rewritten = SATK.mirror_runtime_matlab_scripts(
                code,
                environ={"MATLAB_GATEWAY_CONTAINER_ROOT": str(container_root)},
            )
            self.assertNotIn(str(source_dir), rewritten)
            mirror_root = container_root / ".matlab-gateway-runtime"
            mirrored = list(mirror_root.rglob("*.m"))
            self.assertTrue(mirrored)
            self.assertTrue(any(item.name == "setup_ut_support.m" for item in mirrored))
            self.assertFalse(any("support-package" in item.parts for item in mirrored))
            self.assertFalse(any(item.suffix.lower() in {".slx", ".sldd", ".mat"} for item in mirror_root.rglob("*")))


if __name__ == "__main__":
    unittest.main()
