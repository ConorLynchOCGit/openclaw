import { describe, expect, it, vi } from "vitest";

const clearSharedCodexAppServerClient = vi.fn();

vi.mock("../../../codex/runtime-api.ts", () => ({
  clearSharedCodexAppServerClient,
  getSharedCodexAppServerClient: vi.fn(),
  resolveCodexAppServerRuntimeOptions: () => ({
    approvalPolicy: "never",
    approvalsReviewer: "never",
    requestTimeoutMs: 1_000,
    sandbox: "danger-full-access",
    start: { command: "codex", args: ["app-server", "--listen", "stdio://"] },
  }),
}));

describe("CodexAppServerJsonExecutor cleanup", () => {
  it("closes the shared Codex app-server client explicitly", async () => {
    const { CodexAppServerJsonExecutor } = await import("./codex-app-server-json-executor.ts");
    const executor = new CodexAppServerJsonExecutor({ requestTimeoutMs: 1_000 });

    executor.close();
    executor.close();

    expect(clearSharedCodexAppServerClient).toHaveBeenCalledTimes(2);
  });
});
