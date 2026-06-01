import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runResourceSpecialistNarrowingLoop } from "./resource-specialist-narrowing-loop.ts";

describe("runResourceSpecialistNarrowingLoop", () => {
  it("forces model-authored file and window choices before accepting exact handles", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "resource-specialist-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(
        path.join(repoRoot, "src", "target.ts"),
        [
          "export function targetSelection() {",
          "  return 'node-local resource narrowing';",
          "}",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        path.join(repoRoot, "src", "unrelated.ts"),
        "export const unrelated = true;\n",
        "utf8",
      );

      let turn = 0;
      const result = await runResourceSpecialistNarrowingLoop({
        repoRoot,
        modelRef: "model://test",
        providerPath: "provider://test",
        maxTurns: 6,
        selectionInput: {
          graphId: "graph-test",
          iteration: 1,
          nodeId: "node-test",
          nodeKind: "implementation",
          assignedRole: "implementer",
          capabilityId: "capability://coding.source_edit",
          workIntentRef: "work-intent://node-test",
          nodeExecutionContractRef: "contract://node-test",
          nodeResourceDemandSessionRef: "resource-demand://node-test",
          resourceObjectiveFocusRef: "resource-focus://node-test",
          legalRefUniverseRef: "legal-ref-universe://node-test",
          resourceSpecialistSpecialistRequestRef: "specialist-request://node-test",
          nodeResourceLedgerRef: "ledger://node-test",
          selectedFocusRefs: ["src/"],
          candidateRefs: ["src/"],
          authorityScopeRefs: ["src/"],
          expectedUse: "Find the exact implementation window for the worker.",
          scoutReason: "The worker needs exact handles, not broad directories.",
          allowedToolIds: [
            "resource.scout.submit_exact_handles",
            "resource.scout.mark_narrowing_blocked",
          ],
          requiredFields: [
            "exactContextRefs",
            "handoffSummary",
            "relevantFiles",
            "expectedUse",
          ],
          exactRefRequirements: {
            modelMustChooseExactRefs: true,
            runtimeWillNotChooseLines: true,
            acceptedRefShapes: ["file-window://<path>#L<start>-L<end>"],
            maxExactRefs: 4,
            maxWindowLines: 600,
          },
          repairReasonCodes: [],
        },
        callModel: async (call) => {
          turn += 1;
          if (turn === 1) {
            expect(call.userPayload.allowedToolIds).toContain("resource.scout.open_ref");
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.open_ref",
                input: { ref: "src/" },
              }),
              responseHash: "turn-1",
              latencyMs: 1,
            };
          }
          if (turn === 2) {
            expect(call.userPayload.allowedToolIds).toContain(
              "resource.scout.choose_file_from_listing",
            );
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.mark_narrowing_blocked",
                input: { blockerSummary: "Trying to block too early." },
              }),
              responseHash: "turn-2",
              latencyMs: 1,
            };
          }
          if (turn === 3) {
            expect(call.userPayload.modelReports).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  toolId: "resource.scout.mark_narrowing_blocked",
                }),
              ]),
            );
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.choose_file_from_listing",
                input: { fileRefs: ["src/target.ts"] },
              }),
              responseHash: "turn-3",
              latencyMs: 1,
            };
          }
          if (turn === 4) {
            const refs = call.userPayload.openedExactWindowRefs as string[];
            expect(refs[0]).toBe("file-window://src/target.ts#L1-L3");
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.choose_window_from_matches",
                input: { windowRefs: [refs[0]] },
              }),
              responseHash: "turn-4",
              latencyMs: 1,
            };
          }
          const refs = call.userPayload.openedExactWindowRefs as string[];
          return {
            status: "ok",
            responseText: JSON.stringify({
              toolId: "resource.scout.submit_exact_handles",
              input: {
                exactContextRefs: [refs[0]],
                handoffSummary: "src/target.ts contains the exact implementation hook.",
                relevantFiles: [
                  {
                    fileRef: "src/target.ts",
                    summary: "Use this file for the worker implementation.",
                  },
                ],
                expectedUse: "Hydrate the worker with this exact file window.",
              },
            }),
            responseHash: "turn-5",
            latencyMs: 1,
          };
        },
      });

      expect(result.toolId).toBe("resource.scout.submit_exact_handles");
      expect(result.input.exactContextRefs).toEqual(["file-window://src/target.ts#L1-L3"]);
      expect(result.openedRefCount).toBeGreaterThanOrEqual(2);
      expect(result.selectedWindowCount).toBeGreaterThanOrEqual(1);
      expect(result.reasonCodes).toContain("resource_specialist_narrowing_loop_completed");
      expect(turn).toBe(5);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("requires search and an opened window before exact-handle submission when requested", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "resource-specialist-search-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(
        path.join(repoRoot, "src", "worker.ts"),
        [
          "export function workerContextLoop() {",
          "  return 'context scout exact handles';",
          "}",
          "export const workerContextLoopValidation = true;",
        ].join("\n"),
        "utf8",
      );

      let turn = 0;
      const result = await runResourceSpecialistNarrowingLoop({
        repoRoot,
        modelRef: "model://test",
        providerPath: "provider://test",
        maxTurns: 6,
        selectionInput: {
          graphId: "graph-test",
          iteration: 1,
          nodeId: "node-search-required",
          nodeKind: "implementation",
          assignedRole: "implementer",
          capabilityId: "capability://coding.source_edit",
          workIntentRef: "work-intent://node-search-required",
          nodeExecutionContractRef: "contract://node-search-required",
          nodeResourceDemandSessionRef: "resource-demand://node-search-required",
          resourceObjectiveFocusRef: "resource-focus://node-search-required",
          legalRefUniverseRef: "legal-ref-universe://node-search-required",
          resourceSpecialistSpecialistRequestRef: "specialist-request://node-search-required",
          nodeResourceLedgerRef: "ledger://node-search-required",
          selectedFocusRefs: ["src/"],
          candidateRefs: ["src/"],
          authorityScopeRefs: ["src/"],
          expectedUse: "Find exact worker context windows.",
          scoutReason: "The worker requires a Codex-like search/read/refine loop.",
          allowedToolIds: [
            "resource.scout.submit_exact_handles",
            "resource.scout.mark_narrowing_blocked",
          ],
          requiredFields: [
            "exactContextRefs",
            "handoffSummary",
            "relevantFiles",
            "expectedUse",
          ],
          exactRefRequirements: {
            modelMustChooseExactRefs: true,
            modelMustSearchBeforeSubmit: true,
            modelMustOpenWindowBeforeSubmit: true,
            modelMustReviseWindowBeforeSubmit: true,
            runtimeWillNotChooseLines: true,
            acceptedRefShapes: ["file-window://<path>#L<start>-L<end>"],
            maxExactRefs: 4,
            maxWindowLines: 600,
          },
          repairReasonCodes: [],
        },
        callModel: async (call) => {
          turn += 1;
          if (turn === 1) {
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.submit_exact_handles",
                input: {
                  exactContextRefs: ["file-window://src/worker.ts#L1-L3"],
                  handoffSummary: "Trying to skip search.",
                  expectedUse: "Should be rejected.",
                },
              }),
              responseHash: "turn-1",
              latencyMs: 1,
            };
          }
          if (turn === 2) {
            expect(call.userPayload.modelReports).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  toolId: "resource.scout.submit_exact_handles",
                }),
              ]),
            );
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.choose_search_query",
                input: { ref: "legal_refs", query: "workerContextLoop" },
              }),
              responseHash: "turn-2",
              latencyMs: 1,
            };
          }
          if (turn === 3) {
            const refs = call.userPayload.searchMatchRefs as string[];
            expect(refs[0]).toBe("file-window://src/worker.ts#L1-L4");
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.choose_window_from_matches",
                input: { matchRefs: [refs[0]] },
              }),
              responseHash: "turn-3",
              latencyMs: 1,
            };
          }
          if (turn === 4) {
            const refs = call.userPayload.openedExactWindowRefs as string[];
            expect(refs[0]).toBe("file-window://src/worker.ts#L1-L4");
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.contract_window",
                input: {
                  windowRef: refs[0],
                  startLine: 1,
                  endLine: 3,
                  expectedUse: "Narrow to the exact function body before handoff.",
                },
              }),
              responseHash: "turn-4",
              latencyMs: 1,
            };
          }
          const refs = call.userPayload.openedExactWindowRefs as string[];
          const revisedRef = refs[refs.length - 1];
          return {
            status: "ok",
            responseText: JSON.stringify({
              toolId: "resource.scout.submit_exact_handles",
              input: {
                exactContextRefs: [revisedRef],
                handoffSummary: "The searched and opened worker window is exact.",
                relevantFiles: [
                  {
                    fileRef: "src/worker.ts",
                    ref: revisedRef,
                    summary: "Exact worker context loop surface.",
                  },
                ],
                expectedUse: "Use this window for edit planning.",
              },
            }),
            responseHash: "turn-5",
            latencyMs: 1,
          };
        },
      });

      expect(result.toolId).toBe("resource.scout.submit_exact_handles");
      expect(result.searchResultCount).toBeGreaterThan(0);
      expect(result.selectedWindowCount).toBeGreaterThan(0);
      expect(result.windowRevisionCount).toBe(1);
      expect(result.input.exactContextRefs).toEqual(["file-window://src/worker.ts#L1-L3"]);
      expect(turn).toBe(5);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("adds a final exact-handle handoff turn after the model opens a window on the last inspection turn", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "resource-specialist-final-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(
        path.join(repoRoot, "src", "target.ts"),
        [
          "export function targetSelection() {",
          "  return 'node-local resource narrowing';",
          "}",
        ].join("\n"),
        "utf8",
      );

      let turn = 0;
      const result = await runResourceSpecialistNarrowingLoop({
        repoRoot,
        modelRef: "model://test",
        providerPath: "provider://test",
        maxTurns: 3,
        selectionInput: {
          graphId: "graph-test",
          iteration: 1,
          nodeId: "node-final-handoff",
          nodeKind: "implementation",
          assignedRole: "implementer",
          capabilityId: "capability://coding.source_edit",
          workIntentRef: "work-intent://node-final-handoff",
          nodeExecutionContractRef: "contract://node-final-handoff",
          nodeResourceDemandSessionRef: "resource-demand://node-final-handoff",
          resourceObjectiveFocusRef: "resource-focus://node-final-handoff",
          legalRefUniverseRef: "legal-ref-universe://node-final-handoff",
          resourceSpecialistSpecialistRequestRef: "specialist-request://node-final-handoff",
          nodeResourceLedgerRef: "ledger://node-final-handoff",
          selectedFocusRefs: ["src/target.ts"],
          candidateRefs: ["src/target.ts"],
          authorityScopeRefs: ["src/"],
          expectedUse: "Find the exact implementation window for the worker.",
          scoutReason: "The worker needs exact handles, not broad directories.",
          allowedToolIds: [
            "resource.scout.submit_exact_handles",
            "resource.scout.mark_narrowing_blocked",
          ],
          requiredFields: [
            "exactContextRefs",
            "handoffSummary",
            "relevantFiles",
            "expectedUse",
          ],
          exactRefRequirements: {
            modelMustChooseExactRefs: true,
            runtimeWillNotChooseLines: true,
            acceptedRefShapes: ["file-window://<path>#L<start>-L<end>"],
            maxExactRefs: 4,
            maxWindowLines: 600,
          },
          repairReasonCodes: [],
        },
        callModel: async (call) => {
          turn += 1;
          if (turn === 1) {
            expect(call.userPayload.finalHandoffTurn).toBe(false);
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.open_ref",
                input: { ref: "src/target.ts" },
              }),
              responseHash: "turn-1",
              latencyMs: 1,
            };
          }
          if (turn === 2) {
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.open_window",
                input: { path: "src/target.ts", lineStart: 1, lineEnd: 3 },
              }),
              responseHash: "turn-2",
              latencyMs: 1,
            };
          }
          if (turn === 3) {
            return {
              status: "ok",
              responseText: JSON.stringify({
                toolId: "resource.scout.open_window",
                input: { path: "src/target.ts", lineStart: 1, lineEnd: 3 },
              }),
              responseHash: "turn-3",
              latencyMs: 1,
            };
          }
          expect(call.userPayload.finalHandoffTurn).toBe(true);
          expect(call.userPayload.allowedToolIds).toEqual(
            expect.arrayContaining(["resource.scout.submit_exact_handles"]),
          );
          expect(call.userPayload.allowedToolIds).not.toContain("resource.scout.open_window");
          const refs = call.userPayload.openedExactWindowRefs as string[];
          return {
            status: "ok",
            responseText: JSON.stringify({
              toolId: "resource.scout.submit_exact_handles",
              input: {
                exactContextRefs: [refs[0]],
                handoffSummary: "The opened target window is sufficient for the worker.",
                relevantFiles: [
                  {
                    fileRef: "src/target.ts",
                    summary: "Exact implementation window for the worker.",
                  },
                ],
                expectedUse: "Hydrate the execution node with this exact window.",
              },
            }),
            responseHash: "turn-4",
            latencyMs: 1,
          };
        },
      });

      expect(result.toolId).toBe("resource.scout.submit_exact_handles");
      expect(result.input.exactContextRefs).toEqual(["file-window://src/target.ts#L1-L3"]);
      expect(result.reasonCodes).toContain(
        "resource_specialist_narrowing_final_handoff_turn_after_window",
      );
      expect(turn).toBe(4);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
