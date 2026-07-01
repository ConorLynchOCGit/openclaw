/** Bundled machine-readable readiness checks for deploy promotion gates. */
import { buildConfigGetPayload, buildConfigValidatePayload } from "../cli/config-cli.js";
import { buildExecApprovalsGetPayload } from "../cli/exec-approvals-cli.js";
import { buildLocalExecPolicyShowPayload } from "../cli/exec-policy-cli.js";
import { buildPluginsListPayload } from "../cli/plugins-list-command.js";
import { defaultRuntime, type RuntimeEnv, writeRuntimeJson } from "../runtime.js";
import { buildAgentsListPayload } from "./agents.commands.list.js";
import { buildDoctorLintJsonResult } from "./doctor-lint.js";
import { runPostUpgradeProbes } from "./doctor-post-upgrade.js";

export type PromotionReadinessCheckId =
  | "openclaw-doctor-lint"
  | "openclaw-plugin-compatibility"
  | "openclaw-plugins"
  | "openclaw-agents-list"
  | "openclaw-agent-config"
  | "openclaw-config-validation"
  | "openclaw-exec-policy"
  | "openclaw-approvals";

export type PromotionReadinessCheck = {
  id: PromotionReadinessCheckId;
  command: string[];
  status: "passed" | "failed";
  exitCode: number;
  durationMs: number;
  stdoutJson: unknown;
  stderrJson: unknown;
  note?: string;
};

export type PromotionReadinessReport = {
  schema: "openclaw.promotion_readiness.v1";
  ok: boolean;
  generatedAt: string;
  timingsMs: {
    total: number;
    checks: Array<Pick<PromotionReadinessCheck, "id" | "durationMs" | "exitCode" | "status">>;
  };
  checks: PromotionReadinessCheck[];
  note: string;
};

type CheckBuilder = () => Promise<{
  stdoutJson: unknown;
  exitCode: number;
  note?: string;
}>;

function checkStatus(exitCode: number): "passed" | "failed" {
  return exitCode === 0 ? "passed" : "failed";
}

function hasPostUpgradeError(report: { findings: Array<{ level?: string }> }): boolean {
  return report.findings.some((finding) => finding.level === "error");
}

async function timeCheck(
  id: PromotionReadinessCheckId,
  command: string[],
  build: CheckBuilder,
): Promise<PromotionReadinessCheck> {
  const startedAt = Date.now();
  try {
    const result = await build();
    const durationMs = Date.now() - startedAt;
    const exitCode = result.exitCode;
    return {
      id,
      command,
      status: checkStatus(exitCode),
      exitCode,
      durationMs,
      stdoutJson: result.stdoutJson,
      stderrJson: null,
      ...(result.note ? { note: result.note } : {}),
    };
  } catch (err) {
    return {
      id,
      command,
      status: "failed",
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      stdoutJson: null,
      stderrJson: {
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function buildPromotionReadinessReport(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<PromotionReadinessReport> {
  const startedAt = Date.now();
  const checks = await Promise.all([
    timeCheck(
      "openclaw-doctor-lint",
      ["openclaw", "doctor", "--lint", "--json", "--no-workspace-suggestions"],
      async () => {
        const result = await buildDoctorLintJsonResult(runtime, {
          json: true,
          allowExec: false,
        });
        return {
          stdoutJson: result.payload,
          exitCode: result.exitCode,
        };
      },
    ),
    timeCheck(
      "openclaw-plugin-compatibility",
      ["openclaw", "doctor", "--post-upgrade", "--json"],
      async () => {
        const report = await runPostUpgradeProbes({});
        return {
          stdoutJson: report,
          exitCode: hasPostUpgradeError(report) ? 1 : 0,
        };
      },
    ),
    timeCheck("openclaw-plugins", ["openclaw", "plugins", "list", "--json"], async () => {
      const { payload } = await buildPluginsListPayload({ json: true });
      return {
        stdoutJson: payload,
        exitCode: 0,
      };
    }),
    timeCheck("openclaw-agents-list", ["openclaw", "agents", "list", "--json"], async () => {
      const payload = await buildAgentsListPayload({ json: true }, runtime);
      return {
        stdoutJson: payload ?? [],
        exitCode: payload === null ? 1 : 0,
      };
    }),
    timeCheck(
      "openclaw-agent-config",
      ["openclaw", "config", "get", "agents.list", "--json"],
      async () => ({
        stdoutJson: await buildConfigGetPayload({ path: "agents.list", runtime }),
        exitCode: 0,
      }),
    ),
    timeCheck(
      "openclaw-config-validation",
      ["openclaw", "config", "validate", "--json"],
      async () => {
        const payload = await buildConfigValidatePayload();
        return {
          stdoutJson: payload,
          exitCode: payload.valid ? 0 : 1,
        };
      },
    ),
    timeCheck("openclaw-exec-policy", ["openclaw", "exec-policy", "show", "--json"], async () => ({
      stdoutJson: await buildLocalExecPolicyShowPayload(),
      exitCode: 0,
    })),
    timeCheck("openclaw-approvals", ["openclaw", "approvals", "get", "--json"], async () => {
      const { payload } = await buildExecApprovalsGetPayload({ json: true });
      return {
        stdoutJson: payload,
        exitCode: 0,
      };
    }),
  ]);

  return {
    schema: "openclaw.promotion_readiness.v1",
    ok: checks.every((check) => check.status === "passed"),
    generatedAt: new Date().toISOString(),
    timingsMs: {
      total: Date.now() - startedAt,
      checks: checks.map((check) => ({
        id: check.id,
        durationMs: check.durationMs,
        exitCode: check.exitCode,
        status: check.status,
      })),
    },
    checks,
    note: "Bundled native readiness readback only. Deploy controller remains the promotion admission authority.",
  };
}

export async function runPromotionReadinessCli(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const report = await buildPromotionReadinessReport(runtime);
  writeRuntimeJson(runtime, report);
}
