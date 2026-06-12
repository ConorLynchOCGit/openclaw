import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("product-spec boundary replay terminalization script", () => {
  it("contains the single-node worker error terminalization branch", () => {
    const scriptPath = path.resolve(
      process.cwd(),
      "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    );
    const script = fs.readFileSync(scriptPath, "utf8");

    expect(script).toContain("single_node_worker_replay_failed_terminalized");
    expect(script).toContain("boundary_replay_provider_error_terminalized");
    expect(script).toContain('workerResult = {\n        status: "needs_review"');
    expect(script).toContain('writeJson("product-spec-boundary-replay-result.json", summary)');
  });
});
