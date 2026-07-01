// Promotion readiness tests cover bundled native promotion-gate checks.
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAgentsListPayload: vi.fn(),
  buildConfigGetPayload: vi.fn(),
  buildConfigValidatePayload: vi.fn(),
  buildDoctorLintJsonResult: vi.fn(),
  buildExecApprovalsGetPayload: vi.fn(),
  buildLocalExecPolicyShowPayload: vi.fn(),
  buildPluginsListPayload: vi.fn(),
  runPostUpgradeProbes: vi.fn(),
}));

vi.mock("../cli/config-cli.js", () => ({
  buildConfigGetPayload: mocks.buildConfigGetPayload,
  buildConfigValidatePayload: mocks.buildConfigValidatePayload,
}));

vi.mock("../cli/exec-approvals-cli.js", () => ({
  buildExecApprovalsGetPayload: mocks.buildExecApprovalsGetPayload,
}));

vi.mock("../cli/exec-policy-cli.js", () => ({
  buildLocalExecPolicyShowPayload: mocks.buildLocalExecPolicyShowPayload,
}));

vi.mock("../cli/plugins-list-command.js", () => ({
  buildPluginsListPayload: mocks.buildPluginsListPayload,
}));

vi.mock("./agents.commands.list.js", () => ({
  buildAgentsListPayload: mocks.buildAgentsListPayload,
}));

vi.mock("./doctor-lint.js", () => ({
  buildDoctorLintJsonResult: mocks.buildDoctorLintJsonResult,
}));

vi.mock("./doctor-post-upgrade.js", () => ({
  runPostUpgradeProbes: mocks.runPostUpgradeProbes,
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("promotion readiness", () => {
  it("starts independent native subchecks concurrently and preserves output order", async () => {
    const doctorLint = deferred<{ payload: unknown; exitCode: number }>();
    const postUpgrade = deferred<{ findings: Array<{ level?: string }> }>();
    const plugins = deferred<{ payload: unknown }>();
    const agents = deferred<unknown[]>();
    const config = deferred<unknown>();
    const configValidation = deferred<{ valid: boolean; path: string }>();
    const execPolicy = deferred<unknown>();
    const approvals = deferred<{ payload: unknown }>();

    mocks.buildDoctorLintJsonResult.mockReturnValue(doctorLint.promise);
    mocks.runPostUpgradeProbes.mockReturnValue(postUpgrade.promise);
    mocks.buildPluginsListPayload.mockReturnValue(plugins.promise);
    mocks.buildAgentsListPayload.mockReturnValue(agents.promise);
    mocks.buildConfigGetPayload.mockReturnValue(config.promise);
    mocks.buildConfigValidatePayload.mockReturnValue(configValidation.promise);
    mocks.buildLocalExecPolicyShowPayload.mockReturnValue(execPolicy.promise);
    mocks.buildExecApprovalsGetPayload.mockReturnValue(approvals.promise);

    const { buildPromotionReadinessReport } = await import("./promotion-readiness.js");
    const reportPromise = buildPromotionReadinessReport();
    await Promise.resolve();

    expect(mocks.buildDoctorLintJsonResult).toHaveBeenCalledTimes(1);
    expect(mocks.runPostUpgradeProbes).toHaveBeenCalledTimes(1);
    expect(mocks.buildPluginsListPayload).toHaveBeenCalledTimes(1);
    expect(mocks.buildAgentsListPayload).toHaveBeenCalledTimes(1);
    expect(mocks.buildConfigGetPayload).toHaveBeenCalledTimes(1);
    expect(mocks.buildConfigValidatePayload).toHaveBeenCalledTimes(1);
    expect(mocks.buildLocalExecPolicyShowPayload).toHaveBeenCalledTimes(1);
    expect(mocks.buildExecApprovalsGetPayload).toHaveBeenCalledTimes(1);

    approvals.resolve({ payload: { approvals: [] } });
    execPolicy.resolve({ policy: "ok" });
    configValidation.resolve({ valid: true, path: "openclaw.json" });
    config.resolve([{ id: "main" }]);
    agents.resolve([{ id: "main" }]);
    plugins.resolve({ payload: { plugins: [] } });
    postUpgrade.resolve({ findings: [] });
    doctorLint.resolve({ payload: { findings: [] }, exitCode: 0 });

    const report = await reportPromise;
    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.id)).toEqual([
      "openclaw-doctor-lint",
      "openclaw-plugin-compatibility",
      "openclaw-plugins",
      "openclaw-agents-list",
      "openclaw-agent-config",
      "openclaw-config-validation",
      "openclaw-exec-policy",
      "openclaw-approvals",
    ]);
  });
});
