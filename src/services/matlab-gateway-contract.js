import path from "node:path";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/;
const ALLOWED_MCP_TOOL_ARGUMENTS = Object.freeze({
  model_overview: new Set(["scope", "detail"]),
  model_read: new Set(["scope", "depth"]),
  model_query_params: new Set(["targets", "params", "compile"]),
  model_resolve_params: new Set(["expressions"])
});
const FORBIDDEN_MATLAB_PRIMITIVE_PATTERN =
  /(?:^|[^A-Za-z0-9_])(?:system|unix|dos|perl|web|urlread|urlwrite|tcpclient|udpport|javaMethod|javaObject|py\.)\s*(?:\(|\.|$)/iu;
const QUOTED_ABSOLUTE_PATH_PATTERN =
  /["']((?:\/[^"'\r\n]*|[A-Za-z]:[\\/][^"'\r\n]*|\\\\[^"'\r\n]*))/gu;

export const MATLAB_GATEWAY_LEASE_SCHEMA = "matlab-gateway-lease/v1";
export const MATLAB_GATEWAY_LEASE_STATUSES = Object.freeze([
  "active",
  "broken",
  "closed"
]);

export class MatlabGatewayContractError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = "MatlabGatewayContractError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function requireGatewayIdentifier(value, label = "identifier") {
  const normalized = String(value || "").trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new MatlabGatewayContractError(
      "INVALID_IDENTIFIER",
      `${label} must use 1-128 ASCII letters, digits, dots, underscores, or hyphens.`
    );
  }
  return normalized;
}

export function validateGatewayLeaseIdentity(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MatlabGatewayContractError(
      "INVALID_LEASE_REQUEST",
      "MATLAB Gateway lease identity must be an object."
    );
  }
  return Object.freeze({
    leaseId: requireGatewayIdentifier(value.leaseId, "leaseId"),
    workspaceId: requireGatewayIdentifier(value.workspaceId, "workspaceId"),
    ownerJobId: requireGatewayIdentifier(value.ownerJobId, "ownerJobId")
  });
}

export function requireRelativeFileName(value, label = "fileName") {
  const normalized = String(value || "").trim().replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.includes("/") ||
    normalized === "." ||
    normalized === ".." ||
    path.posix.isAbsolute(normalized) ||
    WINDOWS_ABSOLUTE_PATTERN.test(normalized)
  ) {
    throw new MatlabGatewayContractError("INVALID_FILE_NAME", `${label} must be a plain file name.`);
  }
  return normalized;
}

export function rejectAbsolutePathFields(value, pointer = "$") {
  if (typeof value === "string") {
    const text = value.trim();
    if (path.posix.isAbsolute(text) || WINDOWS_ABSOLUTE_PATTERN.test(text) || text.startsWith("~")) {
      throw new MatlabGatewayContractError(
        "ABSOLUTE_PATH_FORBIDDEN",
        `Absolute host/container paths are forbidden in Gateway requests (${pointer}).`,
        400,
        { pointer }
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectAbsolutePathFields(entry, `${pointer}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      rejectAbsolutePathFields(entry, `${pointer}.${key}`);
    }
  }
}

export function createConfiguredWorkspaceMapping(options = {}) {
  const id = requireGatewayIdentifier(options.id || "worker-data", "mappingId");
  const virtualRoot = path.posix.resolve(String(options.virtualRoot || "/var/lib/sdg/data"));
  const hostRoot = path.resolve(String(options.hostRoot || ""));
  if (!options.hostRoot) {
    throw new MatlabGatewayContractError(
      "HOST_ROOT_REQUIRED",
      "MATLAB_GATEWAY_HOST_ROOT must identify the host side of the shared Worker data bind mount.",
      500
    );
  }
  if (virtualRoot === "/" || hostRoot === path.parse(hostRoot).root) {
    throw new MatlabGatewayContractError(
      "BROAD_MAPPING_FORBIDDEN",
      "Gateway workspace mappings cannot target a filesystem root.",
      500
    );
  }
  if (/['"\r\n]/.test(virtualRoot) || /['"\r\n]/.test(hostRoot)) {
    throw new MatlabGatewayContractError(
      "UNSAFE_MAPPING_ROOT",
      "Gateway workspace mapping roots cannot contain quotes or newlines.",
      500
    );
  }
  return Object.freeze({ id, virtualRoot, hostRoot });
}

export function mapContainerWorkspaceCode(code, mapping) {
  const source = String(code || "");
  const configured = createConfiguredWorkspaceMapping(mapping);
  const virtualRoot = configured.virtualRoot.replace(/\/+$/, "");
  const hostRoot = configured.hostRoot.replace(/[\\/]+$/, "");

  if (FORBIDDEN_MATLAB_PRIMITIVE_PATTERN.test(source)) {
    throw new MatlabGatewayContractError(
      "MATLAB_PRIMITIVE_FORBIDDEN",
      "MATLAB Gateway evaluate requests cannot invoke operating-system or network command primitives."
    );
  }

  for (const match of source.matchAll(QUOTED_ABSOLUTE_PATH_PATTERN)) {
    const normalized = match[1].replaceAll("\\", "/");
    if (normalized !== virtualRoot && !normalized.startsWith(`${virtualRoot}/`)) {
      throw new MatlabGatewayContractError(
        "UNMAPPED_ABSOLUTE_PATH",
        "MATLAB code contains an absolute path outside the configured shared workspace mapping.",
        400,
        { offset: match.index }
      );
    }
  }

  return {
    code: source.split(virtualRoot).join(hostRoot.replaceAll("\\", "/")),
    mappingId: configured.id,
    virtualRoot,
    hostRoot
  };
}

export function validateGatewayToolCall(toolName, args, modelAssetId) {
  const normalizedToolName = requireGatewayIdentifier(toolName, "toolName");
  const allowedKeys = ALLOWED_MCP_TOOL_ARGUMENTS[normalizedToolName];
  if (!allowedKeys) {
    throw new MatlabGatewayContractError(
      "MCP_TOOL_FORBIDDEN",
      `MATLAB Gateway tool is not allowlisted: ${normalizedToolName}`
    );
  }
  if (!modelAssetId) {
    throw new MatlabGatewayContractError(
      "MODEL_ASSET_REQUIRED",
      `${normalizedToolName} requires an uploaded modelAssetId.`
    );
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new MatlabGatewayContractError("INVALID_TOOL_ARGUMENTS", "MCP tool arguments must be an object.");
  }
  for (const [key, value] of Object.entries(args)) {
    if (!allowedKeys.has(key)) {
      throw new MatlabGatewayContractError(
        "MCP_TOOL_ARGUMENT_FORBIDDEN",
        `Argument is not allowed for ${normalizedToolName}: ${key}`
      );
    }
    if (!["string", "number", "boolean"].includes(typeof value)) {
      throw new MatlabGatewayContractError(
        "INVALID_TOOL_ARGUMENT",
        `Argument must be a scalar for ${normalizedToolName}: ${key}`
      );
    }
    if (typeof value === "string" && value.length > 100_000) {
      throw new MatlabGatewayContractError(
        "TOOL_ARGUMENT_TOO_LARGE",
        `Argument is too large for ${normalizedToolName}: ${key}`
      );
    }
  }
  return { toolName: normalizedToolName, arguments: structuredClone(args) };
}

export function gatewayPath(rootDir, ...identifiers) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...identifiers);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new MatlabGatewayContractError("PATH_ESCAPE", "Gateway storage path escaped its configured root.", 500);
  }
  return target;
}
