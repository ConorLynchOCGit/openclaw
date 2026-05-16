import { describe, expect, it } from "vitest";
import {
  projectCanonicalRuntimeQueue,
  applyCloseoutReadbackToCanonicalRuntimeQueue,
} from "./canonical-runtime-queue.ts";
import type { WorkItemTruth } from "./types.ts";

function truth(input: {
  workItemId: string;
  title: string;
  lifecycleState: WorkItemTruth["item"]["lifecycleState"];
  updatedAt: Date;
  runtimeJobId?: string;
  dependsOnWorkItemId?: string;
  closeoutRef?: string;
  assignments?: WorkItemTruth["assignments"];
  parentWorkflowLinks?: WorkItemTruth["parentWorkflowLinks"];
  artifacts?: WorkItemTruth["artifacts"];
}): WorkItemTruth {
  return {
    item: {
      workItemId: input.workItemId,
      itemType: "execution_workflow",
      title: input.title,
      description: null,
      lifecycleState: input.lifecycleState,
      currentVersionId: null,
      metadata: {},
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    },
    currentVersion: null,
    versions: [],
    artifacts:
      input.artifacts ??
      (input.closeoutRef
        ? [
            {
              artifactId: `${input.workItemId}-closeout`,
              workItemId: input.workItemId,
              versionId: null,
              artifactType: "execution_platform.closeout_capsule",
              storageKind: "metadata",
              uri: input.closeoutRef,
              contentType: "application/json",
              sizeBytes: null,
              sha256: null,
              metadata: {},
              createdAt: input.updatedAt,
            },
          ]
        : []),
    events: [],
    assignments: input.assignments ?? [],
    dependencies: input.dependsOnWorkItemId
      ? [
          {
            dependencyId: `${input.workItemId}-dependency`,
            workItemId: input.workItemId,
            dependsOnWorkItemId: input.dependsOnWorkItemId,
            dependencyType: "child_action",
            metadata: {},
            createdAt: input.updatedAt,
          },
        ]
      : [],
    parentWorkflowLinks: input.parentWorkflowLinks ?? [],
    runs: input.runtimeJobId
      ? [
          {
            runId: `${input.workItemId}-run`,
            workItemId: input.workItemId,
            executorKind: "runtime_job",
            runtimeJobId: input.runtimeJobId,
            runtimeJobType: "executor.workflow",
            runState: "succeeded",
            metadata: {},
            startedAt: input.updatedAt,
            completedAt: input.updatedAt,
            createdAt: input.updatedAt,
            updatedAt: input.updatedAt,
            runtimeJob: null,
          },
        ]
      : [],
    steps: [],
  };
}

describe("canonical Work Queue runtime projection", () => {
  it("derives active and closed buckets with dynamic positions from DB truth shape", () => {
    const projection = projectCanonicalRuntimeQueue([
      truth({
        workItemId: "parent",
        title: "Parent work",
        lifecycleState: "running",
        updatedAt: new Date("2026-05-13T01:00:00Z"),
        runtimeJobId: "runtime-parent",
      }),
      truth({
        workItemId: "child",
        title: "Child work",
        lifecycleState: "manual_ready",
        updatedAt: new Date("2026-05-13T02:00:00Z"),
        dependsOnWorkItemId: "parent",
      }),
      truth({
        workItemId: "closed",
        title: "Closed work",
        lifecycleState: "succeeded",
        updatedAt: new Date("2026-05-13T03:00:00Z"),
        runtimeJobId: "runtime-closed",
        closeoutRef: "runtime-job://runtime-closed/closeout",
      }),
    ]);

    expect(projection.active.map((item) => [item.workItemId, item.activePosition])).toEqual([
      ["child", 1],
      ["parent", 2],
    ]);
    expect(projection.closed.map((item) => [item.workItemId, item.closedPosition])).toEqual([
      ["closed", 1],
    ]);
    expect(projection.active.find((item) => item.workItemId === "child")?.dependencyState).toBe(
      "blocked",
    );
    expect(
      projection.active.find((item) => item.workItemId === "child")?.blockingDependencyRefs,
    ).toEqual(["parent"]);
    expect(
      projection.active.find((item) => item.workItemId === "parent")?.childWorkItemIds,
    ).toEqual(["child"]);
    expect(projection.active.find((item) => item.workItemId === "parent")?.runtimeJobIds).toEqual([
      "runtime-parent",
    ]);
    expect(
      projection.active.find((item) => item.workItemId === "parent")?.validationEvidenceState,
    ).toBe("missing");
    expect(
      projection.active.find((item) => item.workItemId === "parent")?.projectionFreshnessState,
    ).toBe("needs_review");
    expect(projection.closed[0]?.closeoutRefs).toEqual(["runtime-job://runtime-closed/closeout"]);
    expect(projection.closed[0]?.closeoutEvidenceState).toBe("present");
    expect(projection.sourceTrackerMode).toBe("db_primary_no_source_tracker");
    expect(projection.runtimeProjectionVersion).toBe("v3");
    expect(projection.workQueueLifecycleMutationAllowed).toBe(false);
  });

  it("applies accepted closeout readback without lifecycle mutation", () => {
    const projection = projectCanonicalRuntimeQueue([
      truth({
        workItemId: "active",
        title: "Active work",
        lifecycleState: "running",
        updatedAt: new Date("2026-05-13T04:00:00Z"),
      }),
    ]);

    const updated = applyCloseoutReadbackToCanonicalRuntimeQueue({
      projection,
      update: {
        workItemId: "active",
        closeoutRef: "runtime-job://runtime-active/closeout",
        graphRefs: ["runtime-job://runtime-active/runtime-work-graph/orchestrator/plan"],
        validationRefs: ["runtime-job://runtime-active/runtime-work-graph/validation/rerun"],
        followUpChildWorkItemIds: ["active-child-1"],
        blockerReasonCodes: ["waiting_on_dependencies"],
        limitations: ["closeout accepted without lifecycle mutation"],
        priorityNote: "Prioritize closing child actions before net-new queue intake.",
        eli5Progress: "Work finished and evidence was recorded.",
        nextStep: "Review follow-up child actions.",
      },
    });

    expect(updated.active[0]?.activePosition).toBe(1);
    expect(updated.active[0]?.closeoutState).toBe("present");
    expect(updated.active[0]?.validationEvidenceState).toBe("present");
    expect(updated.active[0]?.closeoutEvidenceState).toBe("present");
    expect(updated.active[0]?.ownerReadbackState).toBe("ready");
    expect(updated.active[0]?.projectionFreshnessState).toBe("needs_review");
    expect(updated.active[0]?.closeoutRefs).toContain("runtime-job://runtime-active/closeout");
    expect(updated.active[0]?.graphRefs).toContain(
      "runtime-job://runtime-active/runtime-work-graph/orchestrator/plan",
    );
    expect(updated.active[0]?.validationRefs).toContain(
      "runtime-job://runtime-active/runtime-work-graph/validation/rerun",
    );
    expect(updated.active[0]?.childWorkItemIds).toContain("active-child-1");
    expect(updated.active[0]?.evidenceRefs).toEqual(
      expect.arrayContaining([
        "runtime-job://runtime-active/closeout",
        "runtime-job://runtime-active/runtime-work-graph/validation/rerun",
      ]),
    );
    expect(updated.active[0]?.priorityNote).toBe(
      "Prioritize closing child actions before net-new queue intake.",
    );
    expect(updated.active[0]?.workQueueLifecycleMutationAllowed).toBe(false);
  });
});

describe("canonical Work Queue runtime projection hardening", () => {
  it("records a reason code when closeout projection metadata targets a different work item", () => {
    const now = new Date("2026-05-13T08:00:00Z");
    const projection = projectCanonicalRuntimeQueue([
      truth({
        workItemId: "mismatch-source",
        title: "Mismatch source",
        lifecycleState: "running",
        updatedAt: now,
        artifacts: [
          {
            artifactId: "closeout-mismatch",
            workItemId: "mismatch-source",
            versionId: null,
            artifactType: "execution_platform.closeout_projection_readback",
            storageKind: "metadata",
            uri: "runtime-job://mismatch-source/closeout-projection",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {
              workItemId: "different-target",
              closeoutRef: "runtime-job://different-target/closeout",
            },
            createdAt: now,
          },
        ],
      }),
    ]);
    expect(projection.active[0]?.blockerReasonCodes).toContain(
      "closeout_projection_work_item_id_mismatch",
    );
  });

  it("projects a bounded priority note from closeout projection metadata", () => {
    const now = new Date("2026-05-13T08:30:00Z");
    const projection = projectCanonicalRuntimeQueue([
      truth({
        workItemId: "priority-source",
        title: "Priority source",
        lifecycleState: "running",
        updatedAt: now,
        artifacts: [
          {
            artifactId: "closeout-priority",
            workItemId: "priority-source",
            versionId: null,
            artifactType: "execution_platform.closeout_projection_readback",
            storageKind: "metadata",
            uri: "runtime-job://priority-source/closeout-projection",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {
              closeoutRef: "runtime-job://priority-source/closeout",
              priorityNotes: [
                "",
                "Prioritize blocker clearance before adding new coding child actions.",
              ],
            },
            createdAt: now,
          },
        ],
      }),
    ]);

    expect(projection.active[0]?.priorityNote).toBe(
      "Prioritize blocker clearance before adding new coding child actions.",
    );
  });

  it("derives runtime job ids and refs from bounded runtime artifact evidence", () => {
    const updatedAt = new Date("2026-05-13T03:30:00Z");
    const projection = projectCanonicalRuntimeQueue([
      truth({
        workItemId: "artifact-runtime-only",
        title: "Artifact runtime evidence",
        lifecycleState: "running",
        updatedAt,
        artifacts: [
          {
            artifactId: "artifact-runtime-ref",
            workItemId: "artifact-runtime-only",
            versionId: null,
            artifactType: "agent_team.dynamic_orchestrator_plan",
            storageKind: "metadata",
            uri: "runtime-job://artifact-runtime/runtime-work-graph/orchestrator/plan",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {},
            createdAt: updatedAt,
          },
          {
            artifactId: "artifact-runtime-metadata",
            workItemId: "artifact-runtime-only",
            versionId: null,
            artifactType: "agent_team.dynamic_progress",
            storageKind: "metadata",
            uri: "workspace://artifacts/runtime-progress.json",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: { runtimeJobId: "metadata-runtime" },
            createdAt: updatedAt,
          },
        ],
      }),
    ]);

    expect(projection.active[0]?.runtimeJobIds).toEqual(["artifact-runtime", "metadata-runtime"]);
    expect(projection.active[0]?.runtimeJobRefs).toEqual([
      "runtime-job://artifact-runtime",
      "runtime-job://metadata-runtime",
    ]);
  });

  it("links accepted follow-up child refs back to known child items and flags missing children", () => {
    const updatedAt = new Date("2026-05-13T09:00:00Z");
    const projection = projectCanonicalRuntimeQueue([
      truth({
        workItemId: "parent-runtime-truth",
        title: "Parent runtime truth",
        lifecycleState: "running",
        updatedAt,
      }),
      truth({
        workItemId: "child-runtime-truth",
        title: "Child runtime truth",
        lifecycleState: "manual_ready",
        updatedAt: new Date("2026-05-13T08:59:00Z"),
      }),
    ]);

    const updated = applyCloseoutReadbackToCanonicalRuntimeQueue({
      projection,
      update: {
        workItemId: "parent-runtime-truth",
        closeoutRef: "runtime-job://runtime-parent/closeout",
        followUpChildWorkItemIds: ["child-runtime-truth", "missing-child-runtime-truth"],
      },
    });

    const parent = updated.active.find((item) => item.workItemId === "parent-runtime-truth");
    const child = updated.active.find((item) => item.workItemId === "child-runtime-truth");

    expect(parent?.childWorkItemIds).toEqual([
      "child-runtime-truth",
      "missing-child-runtime-truth",
    ]);
    expect(parent?.blockerReasonCodes).toContain("closeout_readback_follow_up_child_ref_missing");
    expect(parent?.limitations).toContain(
      "Follow-up child refs were recorded, but one or more child items are not yet present in runtime projection truth.",
    );
    expect(child?.parentWorkItemIds).toContain("parent-runtime-truth");
  });
});

it("recomputes active and closed positions from runtime truth after lifecycle transitions", () => {
  const beforeClose = projectCanonicalRuntimeQueue([
    truth({
      workItemId: "active-one",
      title: "Active one",
      lifecycleState: "running",
      updatedAt: new Date("2026-05-13T10:00:00Z"),
    }),
    truth({
      workItemId: "active-two",
      title: "Active two",
      lifecycleState: "manual_ready",
      updatedAt: new Date("2026-05-13T09:00:00Z"),
    }),
    truth({
      workItemId: "already-closed",
      title: "Already closed",
      lifecycleState: "succeeded",
      updatedAt: new Date("2026-05-13T08:00:00Z"),
    }),
  ]);

  expect(beforeClose.active.map((item) => [item.workItemId, item.activePosition])).toEqual([
    ["active-one", 1],
    ["active-two", 2],
  ]);
  expect(beforeClose.closed.map((item) => [item.workItemId, item.closedPosition])).toEqual([
    ["already-closed", 1],
  ]);

  const afterClose = projectCanonicalRuntimeQueue([
    truth({
      workItemId: "active-one",
      title: "Active one",
      lifecycleState: "succeeded",
      updatedAt: new Date("2026-05-13T11:00:00Z"),
    }),
    truth({
      workItemId: "active-two",
      title: "Active two",
      lifecycleState: "manual_ready",
      updatedAt: new Date("2026-05-13T09:00:00Z"),
    }),
    truth({
      workItemId: "already-closed",
      title: "Already closed",
      lifecycleState: "succeeded",
      updatedAt: new Date("2026-05-13T08:00:00Z"),
    }),
  ]);

  expect(afterClose.active.map((item) => [item.workItemId, item.activePosition])).toEqual([
    ["active-two", 1],
  ]);
  expect(afterClose.closed.map((item) => [item.workItemId, item.closedPosition])).toEqual([
    ["active-one", 1],
    ["already-closed", 2],
  ]);
});
