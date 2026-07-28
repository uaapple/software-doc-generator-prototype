const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function leaseError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function requireIdentifier(value, field) {
  const normalized = String(value || "").trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw leaseError(
      "software_detail_gateway_invalid_identifier",
      `${field} is invalid.`,
      { field }
    );
  }
  return normalized;
}

function normalizeBaseUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    throw leaseError(
      "software_detail_gateway_unconfigured",
      "MATLAB Gateway URL is not configured."
    );
  }
  return normalized;
}

function isClosedLease(payload = {}) {
  return (
    payload.closed === true ||
    payload.deleted === true ||
    payload.active === false ||
    ["closed", "deleted", "released"].includes(
      String(payload.status || "").trim().toLowerCase()
    )
  );
}

function normalizeActiveLease(payload = {}, expected = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw leaseError(
      "software_detail_gateway_invalid_response",
      "MATLAB Gateway returned an invalid lease response."
    );
  }
  const workspaceId = requireIdentifier(
    payload.workspaceId || expected.workspaceId,
    "workspaceId"
  );
  const leaseId = requireIdentifier(payload.leaseId || expected.leaseId, "leaseId");
  const ownerJobId = requireIdentifier(
    payload.ownerJobId || expected.ownerJobId,
    "ownerJobId"
  );
  if (
    workspaceId !== expected.workspaceId ||
    leaseId !== expected.leaseId ||
    ownerJobId !== expected.ownerJobId ||
    isClosedLease(payload)
  ) {
    throw leaseError(
      "software_detail_gateway_lease_mismatch",
      "MATLAB Gateway lease identity or state does not match the job."
    );
  }
  // Gateway public lease responses deliberately expose only the durable lease
  // identity. In the first software-detail contract the lease itself is the
  // stable reconnect/session handle shared across stages.
  const matlabSessionId = leaseId;
  return Object.freeze({
    workspaceId,
    leaseId,
    ownerJobId,
    matlabSessionId,
    status: "active"
  });
}

export class SoftwareDetailMatlabLeaseClient {
  constructor(options = {}) {
    this.baseURL = normalizeBaseUrl(
      options.baseURL ||
        process.env.MATLAB_GATEWAY_BASE_URL ||
        process.env.SATK_GATEWAY_URL ||
        process.env.MATLAB_MCP_BASE_URL ||
        ""
    );
    this.authToken = String(
      options.authToken ??
        process.env.MATLAB_GATEWAY_TOKEN ??
        process.env.MATLAB_MCP_AUTH_TOKEN ??
        ""
    ).trim();
    this.evaluateToken = String(
      options.evaluateToken ??
        process.env.MATLAB_GATEWAY_EVALUATE_TOKEN ??
        ""
    ).trim();
    this.mappingId = requireIdentifier(
      options.mappingId ||
        process.env.SATK_GATEWAY_MAPPING_ID ||
        process.env.MATLAB_GATEWAY_MAPPING_ID ||
        "worker-data",
      "mappingId"
    );
    this.timeoutMs = Math.max(
      1000,
      Number(
        options.timeoutMs ||
          process.env.MATLAB_GATEWAY_REQUEST_TIMEOUT_MS ||
          process.env.MATLAB_MCP_TIMEOUT_MS ||
          300000
      ) || 300000
    );
    this.fetchImpl = options.fetchImpl || fetch;
  }

  assertConfigured() {
    if (!this.authToken || !this.evaluateToken) {
      throw leaseError(
        "software_detail_gateway_credentials_unconfigured",
        "MATLAB Gateway authentication is not configured for software-detail jobs."
      );
    }
  }

  hermesEnvironment(lease = {}) {
    this.assertConfigured();
    return {
      MATLAB_MCP_BASE_URL: this.baseURL,
      SATK_GATEWAY_URL: this.baseURL,
      MATLAB_MCP_AUTH_TOKEN: this.authToken,
      MATLAB_GATEWAY_TOKEN: this.authToken,
      MATLAB_GATEWAY_EVALUATE_TOKEN: this.evaluateToken,
      SATK_GATEWAY_MAPPING_ID: this.mappingId,
      SOFTWARE_DETAIL_MATLAB_WORKSPACE_ID: requireIdentifier(
        lease.workspaceId,
        "workspaceId"
      ),
      SOFTWARE_DETAIL_MATLAB_LEASE_ID: requireIdentifier(
        lease.leaseId,
        "leaseId"
      ),
      SOFTWARE_DETAIL_RESOURCE_OWNER_JOB_ID: requireIdentifier(
        lease.ownerJobId,
        "ownerJobId"
      ),
      SOFTWARE_DETAIL_MATLAB_SESSION_ID: requireIdentifier(
        lease.matlabSessionId,
        "matlabSessionId"
      )
    };
  }

  async requestJson(route, options = {}) {
    this.assertConfigured();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const hasBody = options.body !== undefined;
      const response = await this.fetchImpl(new URL(route, `${this.baseURL}/`), {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          ...(options.evaluateAuthorized
            ? {
                "x-sdg-evaluate-token": this.evaluateToken,
                "x-sdg-gateway-caller": "software-detail-runtime"
              }
            : {}),
          ...(hasBody ? { "Content-Type": "application/json" } : {})
        },
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      const text = await response.text();
      if (response.status === 404 && options.allowNotFound) {
        return { notFound: true };
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw leaseError(
          "software_detail_gateway_unreadable_response",
          "MATLAB Gateway returned a non-JSON response."
        );
      }
      if (!response.ok || payload?.error) {
        throw leaseError(
          "software_detail_gateway_request_failed",
          "MATLAB Gateway request failed.",
          {
            statusCode: response.status,
            gatewayCode: String(payload?.error?.code || payload?.code || "")
          }
        );
      }
      return payload;
    } catch (cause) {
      if (cause?.code?.startsWith?.("software_detail_gateway_")) throw cause;
      if (cause?.name === "AbortError") {
        throw leaseError(
          "software_detail_gateway_timeout",
          `MATLAB Gateway request timed out after ${this.timeoutMs}ms.`
        );
      }
      throw leaseError(
        "software_detail_gateway_unavailable",
        "MATLAB Gateway is unavailable."
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async createJobLease(input = {}) {
    const workspaceId = requireIdentifier(input.workspaceId, "workspaceId");
    const leaseId = requireIdentifier(input.leaseId, "leaseId");
    const ownerJobId = requireIdentifier(input.ownerJobId, "ownerJobId");
    await this.requestJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}`,
      {
        method: "PUT",
        body: { mappingId: this.mappingId }
      }
    );
    const payload = await this.requestJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/leases/${encodeURIComponent(leaseId)}`,
      {
        method: "PUT",
        body: { ownerJobId }
      }
    );
    return normalizeActiveLease(payload, { workspaceId, leaseId, ownerJobId });
  }

  async getJobLease(input = {}) {
    const workspaceId = requireIdentifier(input.workspaceId, "workspaceId");
    const leaseId = requireIdentifier(input.leaseId, "leaseId");
    const ownerJobId = requireIdentifier(input.ownerJobId, "ownerJobId");
    const payload = await this.requestJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/leases/${encodeURIComponent(leaseId)}`
    );
    return normalizeActiveLease(payload, { workspaceId, leaseId, ownerJobId });
  }

  async closeJobLease(input = {}) {
    const workspaceId = requireIdentifier(input.workspaceId, "workspaceId");
    const leaseId = requireIdentifier(input.leaseId, "leaseId");
    const ownerJobId = requireIdentifier(input.ownerJobId, "ownerJobId");
    const payload = await this.requestJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/leases/${encodeURIComponent(leaseId)}`,
      {
        method: "DELETE",
        body: { ownerJobId }
      }
    );
    if (!isClosedLease(payload)) {
      throw leaseError(
        "software_detail_gateway_close_unconfirmed",
        "MATLAB Gateway did not confirm lease closure."
      );
    }
    const confirmation = await this.requestJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/leases/${encodeURIComponent(leaseId)}`,
      { allowNotFound: true }
    );
    if (!confirmation.notFound && !isClosedLease(confirmation)) {
      throw leaseError(
        "software_detail_gateway_close_unconfirmed",
        "MATLAB Gateway lease remained active after close."
      );
    }
    return Object.freeze({
      workspaceId,
      leaseId,
      ownerJobId,
      matlabSessionId: leaseId,
      status: "closed",
      confirmed: true
    });
  }

  async submitLeasedJob(jobId, body = {}, lease = {}) {
    const normalizedJobId = requireIdentifier(jobId, "jobId");
    const workspaceId = requireIdentifier(lease.workspaceId, "workspaceId");
    const leaseId = requireIdentifier(lease.leaseId, "leaseId");
    const ownerJobId = requireIdentifier(lease.ownerJobId, "ownerJobId");
    return this.requestJson(`/api/jobs/${encodeURIComponent(normalizedJobId)}`, {
      method: "POST",
      evaluateAuthorized: body.operation === "evaluate_matlab_code",
      body: {
        ...body,
        workspaceId,
        leaseId,
        ownerJobId
      }
    });
  }
}
