import path from "node:path";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/;

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

function decodeMatlabString(value = "", quote = "'") {
  return quote === "'" ? value.replaceAll("''", "'") : value.replaceAll('""', '"');
}

function matlabStringLiterals(code = "") {
  const literals = [];
  const single = /'((?:''|[^'])*)'/g;
  const double = /"((?:""|[^"])*)"/g;
  for (const [pattern, quote] of [[single, "'"], [double, '"']]) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      literals.push({
        value: decodeMatlabString(match[1], quote),
        offset: match.index
      });
    }
  }
  return literals;
}

function looksAbsolutePath(value = "") {
  return path.posix.isAbsolute(value) || WINDOWS_ABSOLUTE_PATTERN.test(value) || value.startsWith("~");
}

export function mapContainerWorkspaceCode(code, mapping) {
  const source = String(code || "");
  const configured = createConfiguredWorkspaceMapping(mapping);
  const virtualRoot = configured.virtualRoot.replace(/\/+$/, "");
  const hostRoot = configured.hostRoot.replace(/[\\/]+$/, "");

  for (const literal of matlabStringLiterals(source)) {
    if (!looksAbsolutePath(literal.value)) continue;
    const normalized = literal.value.replaceAll("\\", "/");
    if (normalized !== virtualRoot && !normalized.startsWith(`${virtualRoot}/`)) {
      throw new MatlabGatewayContractError(
        "UNMAPPED_ABSOLUTE_PATH",
        "MATLAB code contains an absolute path outside the configured shared workspace mapping.",
        400,
        { offset: literal.offset }
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

export function gatewayPath(rootDir, ...identifiers) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...identifiers);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new MatlabGatewayContractError("PATH_ESCAPE", "Gateway storage path escaped its configured root.", 500);
  }
  return target;
}

