import importlib.util
import hashlib
import io
import json
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

HOST_VALIDATOR_SCRIPT = SCRIPT.parent / "host_validate_tcsd_stage.py"
HOST_VALIDATOR_SPEC = importlib.util.spec_from_file_location(
    "host_validate_gateway_evidence_test",
    HOST_VALIDATOR_SCRIPT,
)
HOST_VALIDATOR = importlib.util.module_from_spec(HOST_VALIDATOR_SPEC)
assert HOST_VALIDATOR_SPEC.loader
HOST_VALIDATOR_SPEC.loader.exec_module(HOST_VALIDATOR)


class JsonResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


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
                    SATK.gateway_request("GET", "/health", retry_delays=())

    def test_idempotent_gateway_methods_retry_transient_url_error_then_succeed(self):
        response = {"ok": True}
        for method in ("GET", "PUT", "DELETE"):
            with self.subTest(method=method):
                sleep = mock.Mock()
                with mock.patch.dict(
                    os.environ,
                    {"SATK_GATEWAY_URL": "http://host.docker.internal:5100"},
                    clear=True,
                ):
                    with mock.patch.object(
                        SATK.urllib.request,
                        "urlopen",
                        side_effect=[
                            urllib.error.URLError("route unavailable"),
                            JsonResponse(response),
                        ],
                    ) as urlopen:
                        self.assertEqual(
                            SATK.gateway_request(
                                method,
                                "/fixture",
                                retry_delays=(0.01, 0.02),
                                sleep=sleep,
                            ),
                            response,
                        )
                self.assertEqual(urlopen.call_count, 2)
                sleep.assert_called_once_with(0.01)

    def test_idempotent_gateway_request_exhausts_bounded_retries(self):
        sleep = mock.Mock()
        with mock.patch.dict(
            os.environ,
            {"SATK_GATEWAY_URL": "http://host.docker.internal:5100"},
            clear=True,
        ):
            with mock.patch.object(
                SATK.urllib.request,
                "urlopen",
                side_effect=urllib.error.URLError("route unavailable"),
            ) as urlopen:
                with self.assertRaisesRegex(RuntimeError, "Gateway is unavailable"):
                    SATK.gateway_request(
                        "DELETE",
                        "/api/workspaces/fixture",
                        retry_delays=(0.01, 0.02),
                        sleep=sleep,
                    )
        self.assertEqual(urlopen.call_count, 3)
        self.assertEqual(sleep.call_args_list, [mock.call(0.01), mock.call(0.02)])

    def test_post_gateway_request_does_not_retry_url_error(self):
        sleep = mock.Mock()
        with mock.patch.dict(
            os.environ,
            {"SATK_GATEWAY_URL": "http://host.docker.internal:5100"},
            clear=True,
        ):
            with mock.patch.object(
                SATK.urllib.request,
                "urlopen",
                side_effect=urllib.error.URLError("route unavailable"),
            ) as urlopen:
                with self.assertRaisesRegex(RuntimeError, "Gateway is unavailable"):
                    SATK.gateway_request(
                        "POST",
                        "/api/jobs/fixture",
                        payload={"workspaceId": "fixture"},
                        retry_delays=(0.01, 0.02),
                        sleep=sleep,
                    )
        self.assertEqual(urlopen.call_count, 1)
        sleep.assert_not_called()

    def test_gateway_http_error_does_not_retry(self):
        error = urllib.error.HTTPError(
            "http://host.docker.internal:5100/health",
            503,
            "Service Unavailable",
            {},
            io.BytesIO(b'{"error":{"code":"NOT_READY","message":"not ready"}}'),
        )
        sleep = mock.Mock()
        with mock.patch.dict(
            os.environ,
            {"SATK_GATEWAY_URL": "http://host.docker.internal:5100"},
            clear=True,
        ):
            with mock.patch.object(
                SATK.urllib.request,
                "urlopen",
                side_effect=error,
            ) as urlopen:
                with self.assertRaisesRegex(RuntimeError, "NOT_READY"):
                    SATK.gateway_request(
                        "GET",
                        "/health",
                        retry_delays=(0.01, 0.02),
                        sleep=sleep,
                    )
        self.assertEqual(urlopen.call_count, 1)
        sleep.assert_not_called()

    def test_host_validator_health_fetch_retries_transient_url_error(self):
        sleep = mock.Mock()
        with mock.patch.object(
            HOST_VALIDATOR.urllib.request,
            "urlopen",
            side_effect=[
                urllib.error.URLError("route unavailable"),
                JsonResponse({"ok": True}),
            ],
        ) as urlopen:
            self.assertEqual(
                HOST_VALIDATOR.fetch_gateway_evidence(
                    "/health",
                    "http://host.docker.internal:5100",
                    "fixture-token",
                    retry_delays=(0.01,),
                    sleep=sleep,
                ),
                {"ok": True},
            )
        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(0.01)

    def test_gateway_server_info_uses_authenticated_remote_evidence_without_local_path(self):
        health = {
            "schema": "matlab-gateway-health/v1",
            "ok": True,
            "service": "matlab-gateway",
            "version": "1.0.0",
        }
        version = {
            "schema": "matlab-gateway-version/v1",
            "service": "matlab-gateway",
            "gatewayVersion": "1.0.0",
            "matlabRelease": "R2026a",
            "matlabMcpVersion": "0.11.1",
            "satkVersion": "2026.07.08",
        }
        environ = {
            "SATK_GATEWAY_URL": "http://host.docker.internal:5100",
            "MATLAB_MCP_AUTH_TOKEN": "fixture-token",
        }
        with mock.patch.object(
            SATK,
            "gateway_request",
            side_effect=[health, version],
        ):
            server = SATK.server_info(environ=environ)

        self.assertEqual(server["discovery"], "matlab-gateway")
        self.assertNotIn("path", server)
        self.assertNotIn("sizeBytes", server)
        responses = {"/health": health, "/version": version}
        details = HOST_VALIDATOR.validate_satk_server(
            server,
            environ=environ,
            gateway_fetch=lambda route, _url, _token: responses[route],
        )
        self.assertEqual(details["satkServerDiscovery"], "matlab-gateway")
        self.assertEqual(details["satkGatewayVersion"], "1.0.0")
        self.assertRegex(details["satkGatewayEvidenceSha256"], r"^[a-f0-9]{64}$")

    def test_gateway_server_evidence_rejects_forged_local_path_and_tampering(self):
        payload = {
            "schema": "tcsd-matlab-gateway-evidence/v1",
            "authenticated": True,
            "health": {
                "schema": "matlab-gateway-health/v1",
                "service": "matlab-gateway",
                "ok": True,
                "gatewayVersion": "1.0.0",
            },
            "version": {
                "schema": "matlab-gateway-version/v1",
                "service": "matlab-gateway",
                "gatewayVersion": "1.0.0",
                "matlabRelease": "R2026a",
                "matlabMcpVersion": "0.11.1",
                "satkVersion": "2026.07.08",
            },
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        server = {
            "discovery": "matlab-gateway",
            "gatewayUrl": "http://host.docker.internal:5100",
            "gatewayVersion": "1.0.0",
            "matlabRelease": "R2026a",
            "matlabMcpVersion": "0.11.1",
            "satkVersion": "2026.07.08",
            "gatewayEvidence": {**payload, "sha256": digest},
        }
        forged = {**server, "path": "/opt/fake/matlab-mcp-server"}
        with self.assertRaisesRegex(ValueError, "must not claim"):
            HOST_VALIDATOR.validate_satk_server(forged)
        tampered = {
            **server,
            "gatewayEvidence": {
                **server["gatewayEvidence"],
                "version": {
                    **server["gatewayEvidence"]["version"],
                    "satkVersion": "tampered",
                },
            },
        }
        with self.assertRaisesRegex(ValueError, "evidence is invalid"):
            HOST_VALIDATOR.validate_satk_server(
                tampered,
                environ={
                    "SATK_GATEWAY_URL": "http://host.docker.internal:5100",
                    "MATLAB_MCP_AUTH_TOKEN": "fixture-token",
                },
                gateway_fetch=lambda route, _url, _token: (
                    payload["health"] if route == "/health" else payload["version"]
                ),
            )

    def test_direct_server_evidence_keeps_path_hash_and_size_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            server_path = Path(temp) / "matlab-mcp-server"
            server_path.write_bytes(b"direct MCP fixture")
            server = {
                "discovery": "official-toolkit",
                "path": str(server_path),
                "sha256": hashlib.sha256(server_path.read_bytes()).hexdigest(),
                "sizeBytes": server_path.stat().st_size,
            }
            details = HOST_VALIDATOR.validate_satk_server(server)
            self.assertEqual(details["satkServerPath"], str(server_path.resolve()))
            self.assertEqual(details["satkServerSha256"], server["sha256"])

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
