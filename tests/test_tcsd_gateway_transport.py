import importlib.util
import json
import os
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = REPO / "skills" / "hermes" / "tcsd-runtime" / "scripts"
TRANSPORT = REPO / "containers" / "worker" / "tcsd-gateway-transport.c"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


class GatewayHandler(BaseHTTPRequestHandler):
    received_authorization = []

    def do_GET(self):
        type(self).received_authorization.append(self.headers.get("Authorization"))
        payload = {
            "/health": {"schema": "matlab-gateway-health/v1", "service": "matlab-gateway", "ok": True, "version": "test"},
            "/version": {"schema": "matlab-gateway-version/v1", "service": "matlab-gateway", "gatewayVersion": "test"},
        }.get(self.path)
        if payload is None:
            self.send_error(404)
            return
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        pass


class GatewayTransportTests(unittest.TestCase):
    def test_transport_injects_bearer_only_into_controlled_client(self):
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory) / "tcsd-gateway-transport"
            secret = Path(directory) / "tcsd-gateway.env"
            subprocess.run([
                "cc", "-O2", "-Wall", "-Wextra", "-Werror",
                f'-DSECRET_FILE=\"{secret}\"',
                f'-DSATK_SCRIPT=\"{SCRIPTS / "satk_eval.py"}\"',
                f'-DLEASE_SCRIPT=\"{REPO / "skills" / "hermes" / "software-detail-runtime" / "scripts" / "matlab_gateway_lease.py"}\"',
                f'-DPYTHON_EXECUTABLE=\"{os.sys.executable}\"',
                f"-DTRANSPORT_GID={os.getgid()}", "-DREQUIRE_ROOT_OWNER=0",
                "-o", str(binary), str(TRANSPORT),
            ], check=True)
            secret.write_text("MATLAB_MCP_AUTH_TOKEN=bearer-test\nMATLAB_GATEWAY_EVALUATE_TOKEN=evaluate-test\n", encoding="utf-8")
            secret.chmod(0o400)
            server = ThreadingHTTPServer(("127.0.0.1", 0), GatewayHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            GatewayHandler.received_authorization.clear()
            thread.start()
            try:
                result = subprocess.run(
                    [str(binary), str(SCRIPTS / "satk_eval.py"), "--server-info"],
                    env={"SATK_GATEWAY_URL": f"http://127.0.0.1:{server.server_port}"},
                    text=True, capture_output=True, check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(GatewayHandler.received_authorization, ["Bearer bearer-test", "Bearer bearer-test"])
                self.assertNotIn("bearer-test", result.stdout + result.stderr)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()
                secret.unlink(missing_ok=True)

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

    def test_transport_exposes_tokens_only_to_approved_python_client(self):
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory) / "tcsd-gateway-transport"
            secret = Path(directory) / "tcsd-gateway.env"
            subprocess.run([
                "cc", "-O2", "-Wall", "-Wextra", "-Werror",
                f'-DSECRET_FILE=\"{secret}\"',
                f'-DSATK_SCRIPT=\"{SCRIPTS / "satk_eval.py"}\"',
                f'-DLEASE_SCRIPT=\"{REPO / "skills" / "hermes" / "software-detail-runtime" / "scripts" / "matlab_gateway_lease.py"}\"',
                f'-DPYTHON_EXECUTABLE=\"{os.sys.executable}\"',
                f"-DTRANSPORT_GID={os.getgid()}",
                "-DREQUIRE_ROOT_OWNER=0",
                "-o", str(binary), str(TRANSPORT),
            ], check=True)
            secret.write_text("MATLAB_MCP_AUTH_TOKEN=bearer-test\nMATLAB_GATEWAY_EVALUATE_TOKEN=evaluate-test\n", encoding="utf-8")
            secret.chmod(0o400)
            try:
                result = subprocess.run(
                    [str(binary), str(SCRIPTS / "satk_eval.py"), "--server-info"],
                    env={
                        "PATH": os.environ["PATH"], "PYTHON_EXECUTABLE": "/bin/false",
                        "PYTHONPATH": "/tmp/untrusted-python", "PYTHONINSPECT": "1",
                        "SATK_GATEWAY_URL": "http://127.0.0.1:1",
                    },
                    text=True,
                    capture_output=True,
                )
                self.assertEqual(result.returncode, 1)
                self.assertNotIn("MATLAB_MCP_AUTH_TOKEN is unavailable", result.stderr)
                self.assertNotIn("bearer-test", result.stdout + result.stderr)
                self.assertNotIn("untrusted-python", result.stdout + result.stderr)
                alias = Path(directory) / "satk_eval.py"
                alias.symlink_to(SCRIPTS / "satk_eval.py")
                alias_result = subprocess.run(
                    [str(binary), str(alias), "--server-info"],
                    env={"SATK_GATEWAY_URL": "http://127.0.0.1:1"}, text=True, capture_output=True,
                )
                self.assertEqual(alias_result.returncode, 1)
                self.assertNotIn("bearer-test", alias_result.stdout + alias_result.stderr)
                rejected = subprocess.run([str(binary), "/bin/echo", "unexpected"], text=True, capture_output=True)
                self.assertEqual(rejected.returncode, 64)
            finally:
                secret.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
