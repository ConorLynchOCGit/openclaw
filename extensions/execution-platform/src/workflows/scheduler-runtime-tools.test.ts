import { describe, expect, it } from "vitest";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import {
  SCHEDULER_RUNTIME_TOOL_IDS,
  registerSchedulerRuntimeTools,
} from "./scheduler-runtime-tools.ts";

describe("scheduler runtime tools", () => {
  it("registers compound coding tools as bounded repo-write runtime operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "coding.inspect_edit_validate",
      "coding.add_test_and_validate",
      "coding.update_docs_and_cross_refs",
      "coding.refactor_symbol_with_lsp",
      "coding.fix_type_errors",
      "coding.apply_small_patch_with_evidence",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "coding.compound",
        authorityClass: "bounded_repo_write",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/coding\//u);
    }
  });
});
