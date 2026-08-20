import importlib.util
import os
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = REPO / "skills" / "hermes" / "tcsd-runtime" / "scripts"
TRANSPORT = REPO / "containers" / "worker" / "tcsd-gateway-transport"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


class GatewayTransportTests(unittest.TestCase):
    def test_transport_is_a_non_privileged_allowlist_wrapper(self):
        source = TRANSPORT.read_text(encoding="utf-8")
        self.assertIn("/opt/sdg/venv/bin/python", source)
        self.assertIn("tcsd-runtime/scripts/satk_eval.py", source)
        self.assertIn("software-detail-runtime/scripts/matlab_gateway_lease.py", source)
        self.assertNotIn("libexec", source)
        self.assertNotIn("setgid", source.lower())
        self.assertNotIn("/run/secrets", source)

        rejected = subprocess.run(
            ["sh", str(TRANSPORT), "/bin/echo", "unexpected"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(rejected.returncode, 64)
        self.assertIn("unsupported controlled script", rejected.stderr)

    def test_clean_stale_is_not_implied_by_dedicated_worker(self):
        previous = dict(os.environ)
        try:
            os.environ["TCSD_DEDICATED_WORKER"] = "1"
            os.environ.pop("TCSD_CLEAN_STALE_MCP", None)
            module = load_module("satk_clean_stale_off", SCRIPTS / "satk_eval.py")
            self.assertFalse(module.CLEAN_STALE_MCP)
            os.environ["TCSD_CLEAN_STALE_MCP"] = "true"
            module = load_module("satk_clean_stale_on", SCRIPTS / "satk_eval.py")
            self.assertTrue(module.CLEAN_STALE_MCP)
        finally:
            os.environ.clear()
            os.environ.update(previous)

if __name__ == "__main__":
    unittest.main()
