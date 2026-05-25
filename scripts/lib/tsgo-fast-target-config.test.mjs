import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFastTsgoArgs,
  buildTargetedTsgoConfig,
  filterFullRepoFallbackArgs,
} from "./tsgo-fast-target-config.mjs";

void test("targeted tsgo config uses files instead of forwarding file args beside --project", () => {
  const cwd = "/repo";
  const config = buildTargetedTsgoConfig({
    cwd,
    targets: ["extensions/execution-platform/src/workflows/node-resource-materialization.ts"],
  });

  assert.equal(config.extends, "../../tsconfig.json");
  assert.deepEqual(config.files, [
    "/repo/extensions/execution-platform/src/workflows/node-resource-materialization.ts",
  ]);
});

void test("full-repo fallback strips explicit source file args to avoid TS5112", () => {
  assert.deepEqual(
    filterFullRepoFallbackArgs([
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      "--pretty",
      "false",
      "README.md",
    ]),
    ["--pretty", "false"],
  );
  assert.deepEqual(
    buildFastTsgoArgs({
      broadChange: true,
      targets: ["extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts"],
      userArgs: ["extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts"],
    }),
    [],
  );
});
