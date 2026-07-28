export function evaluateTrivyPolicy(report = {}, licensePolicy = {}) {
  const findings = [];
  const blockingVulnerabilitySeverities = new Set(
    (licensePolicy.blockingVulnerabilitySeverities || [])
      .map((item) => String(item).trim().toUpperCase())
  );
  const denied = new Set(
    (licensePolicy.deniedIdentifiers || []).map((item) => String(item).trim().toUpperCase())
  );
  for (const result of Array.isArray(report.Results) ? report.Results : []) {
    for (const vulnerability of Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : []) {
      const severity = String(vulnerability.Severity || "").toUpperCase();
      if (blockingVulnerabilitySeverities.has(severity)) {
        findings.push({
          kind: "vulnerability",
          id: String(vulnerability.VulnerabilityID || ""),
          severity
        });
      }
    }
    for (const secret of Array.isArray(result.Secrets) ? result.Secrets : []) {
      findings.push({
        kind: "secret",
        ruleId: String(secret.RuleID || secret.Category || "secret")
      });
    }
    for (const license of Array.isArray(result.Licenses) ? result.Licenses : []) {
      const identifier = String(
        license.Name ||
        license.SPDXExpression ||
        license.FullName ||
        ""
      ).trim();
      const normalized = identifier.toUpperCase();
      const classification = String(
        license.Severity ||
        license.Classification ||
        license.Category ||
        ""
      ).trim().toUpperCase();
      const unknown = !identifier ||
        normalized === "UNKNOWN" ||
        classification === "UNKNOWN" ||
        classification === "NON STANDARD" ||
        classification === "NON-STANDARD";
      if ((unknown && licensePolicy.denyUnknown) || denied.has(normalized)) {
        findings.push({
          kind: "license",
          identifier: identifier || "UNKNOWN",
          classification: classification || "UNKNOWN"
        });
      }
    }
  }
  return findings;
}

export function summarizeTrivyReport(report = {}) {
  const summary = {
    highVulnerabilities: 0,
    criticalVulnerabilities: 0,
    secrets: 0,
    licenses: 0
  };
  for (const result of Array.isArray(report.Results) ? report.Results : []) {
    for (const vulnerability of Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : []) {
      const severity = String(vulnerability.Severity || "").toUpperCase();
      if (severity === "HIGH") summary.highVulnerabilities += 1;
      if (severity === "CRITICAL") summary.criticalVulnerabilities += 1;
    }
    summary.secrets += Array.isArray(result.Secrets) ? result.Secrets.length : 0;
    summary.licenses += Array.isArray(result.Licenses) ? result.Licenses.length : 0;
  }
  return summary;
}
