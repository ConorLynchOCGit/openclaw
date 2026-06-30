/** CLI entrypoint for non-mutating doctor lint health checks. */
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { readConfigFileSnapshot } from "../config/config.js";
import { registerBundledHealthChecks } from "../flows/bundled-health-checks.js";
import {
  configValidationIssuesToHealthFindings,
  registerCoreHealthChecks,
} from "../flows/doctor-core-checks.js";
import {
  exitCodeFromFindings,
  runDoctorLintChecks,
  type DoctorLintRunOptions,
} from "../flows/doctor-lint-flow.js";
import {
  healthFindingMeetsSeverity,
  parseHealthFindingSeverity,
  type HealthCheckContext,
  type HealthFinding,
} from "../flows/health-checks.js";
import type { RuntimeEnv } from "../runtime.js";

export interface DoctorLintCliOptions {
  readonly json?: boolean;
  readonly severityMin?: string;
  readonly skipIds?: readonly string[];
  readonly onlyIds?: readonly string[];
  readonly allowExec?: boolean;
}

export type DoctorLintJsonResult = {
  ok: boolean;
  checksRun: number;
  checksSkipped: number;
  timingsMs?: {
    total: number;
    checks: readonly {
      id: string;
      durationMs: number;
      status: "passed" | "failed";
    }[];
  };
  findings: Record<string, unknown>[];
};

function detectMode(opts: DoctorLintCliOptions): "human" | "json" {
  if (opts.json === true) {
    return "json";
  }
  return process.stdout.isTTY ? "human" : "json";
}

/** Build the machine-readable doctor lint payload without writing to stdout. */
export async function buildDoctorLintJsonResult(
  runtime: RuntimeEnv,
  opts: DoctorLintCliOptions,
): Promise<{ payload: DoctorLintJsonResult; exitCode: number; visibleFindings: HealthFinding[] }> {
  registerCoreHealthChecks();

  const sevMin =
    opts.severityMin === undefined ? "info" : parseHealthFindingSeverity(opts.severityMin);
  if (sevMin === null) {
    throw new Error("Invalid --severity-min value. Expected one of: info, warning, error.");
  }
  const snapshot = await readConfigFileSnapshot({ observe: false });
  if (snapshot.exists && !snapshot.valid) {
    const findings = configValidationIssuesToHealthFindings(snapshot.issues);
    const visible = findings.filter((finding) => healthFindingMeetsSeverity(finding, sevMin));
    const exitCode = exitCodeFromFindings(findings, sevMin);
    return {
      payload: {
        ok: false,
        checksRun: 1,
        checksSkipped: 0,
        findings: visible.map(toJsonFinding),
      },
      exitCode,
      visibleFindings: visible,
    };
  }

  const ctx: HealthCheckContext = {
    mode: "lint",
    runtime,
    cfg: snapshot.config,
    cwd: resolveAgentWorkspaceDir(snapshot.config, resolveDefaultAgentId(snapshot.config)),
    allowExecSecretRefs: opts.allowExec === true,
    ...(snapshot.path !== undefined ? { configPath: snapshot.path } : {}),
  };
  registerBundledHealthChecks({ cfg: snapshot.config, cwd: ctx.cwd });

  const runOpts: DoctorLintRunOptions = {
    ...(opts.skipIds && opts.skipIds.length > 0 ? { skipIds: opts.skipIds } : {}),
    ...(opts.onlyIds && opts.onlyIds.length > 0 ? { onlyIds: opts.onlyIds } : {}),
  };
  const result = await runDoctorLintChecks(ctx, runOpts);
  const visible = result.findings.filter((finding) => healthFindingMeetsSeverity(finding, sevMin));
  const exitCode = exitCodeFromFindings(result.findings, sevMin);
  return {
    payload: {
      ok: exitCode === 0,
      checksRun: result.checksRun,
      checksSkipped: result.checksSkipped,
      timingsMs: result.timingsMs,
      findings: visible.map(toJsonFinding),
    },
    exitCode,
    visibleFindings: visible,
  };
}

/**
 * Runs registered doctor health checks in human or JSON mode and returns the lint exit code.
 *
 * Invalid config is reported before regular health checks because most checks need a parsed config
 * and workspace root.
 */
export async function runDoctorLintCli(
  runtime: RuntimeEnv,
  opts: DoctorLintCliOptions,
): Promise<number> {
  const result = await buildDoctorLintJsonResult(runtime, opts);
  if (detectMode(opts) === "json") {
    writeJsonResult(result.payload);
    return result.exitCode;
  }

  const snapshot = await readConfigFileSnapshot({ observe: false });
  if (snapshot.exists && !snapshot.valid) {
    runtime.error("doctor --lint: config file exists but does not parse cleanly.");
    for (const issue of snapshot.issues) {
      const path = issue.path || "<root>";
      runtime.error(`- ${path}: ${issue.message}`);
    }
    return result.exitCode;
  }

  process.stdout.write(
    `doctor --lint: ran ${result.payload.checksRun} check(s), ${result.visibleFindings.length} finding(s)\n`,
  );
  if (result.visibleFindings.length === 0) {
    process.stdout.write("  no findings\n");
  } else {
    for (const f of result.visibleFindings) {
      const where = f.path !== undefined ? ` ${f.path}` : "";
      const line = f.line !== undefined ? `:${f.line}` : "";
      process.stdout.write(`  [${f.severity}] ${f.checkId}${where}${line} - ${f.message}\n`);
      if (f.fixHint !== undefined) {
        process.stdout.write(`    fix: ${f.fixHint}\n`);
      }
    }
  }

  return result.exitCode;
}

function writeJsonResult(result: DoctorLintJsonResult): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}

function toJsonFinding(f: HealthFinding): Record<string, unknown> {
  return {
    checkId: f.checkId,
    severity: f.severity,
    message: f.message,
    ...(f.source !== undefined ? { source: f.source } : {}),
    ...(f.path !== undefined ? { path: f.path } : {}),
    ...(f.line !== undefined ? { line: f.line } : {}),
    ...(f.column !== undefined ? { column: f.column } : {}),
    ...(f.ocPath !== undefined ? { ocPath: f.ocPath } : {}),
    ...(f.target !== undefined ? { target: f.target } : {}),
    ...(f.requirement !== undefined ? { requirement: f.requirement } : {}),
    ...(f.fixHint !== undefined ? { fixHint: f.fixHint } : {}),
  };
}
