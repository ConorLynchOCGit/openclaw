import { normalizeModelRefStringForComparison } from "../agents/model-selection-normalize.js";
// Validates native task execution receipts for critical launch routes.
import type { AgentRunReceipt } from "../agents/run-receipt.js";
import type { TaskRecord } from "./task-registry.types.js";

export type TaskExecutionCheck = "gbrain.signal_detector";
export type TaskExecutionAdmissionCheck = TaskExecutionCheck;

export type TaskExecutionAdmissionFailureCode =
  | "task_not_found"
  | "receipt_missing"
  | "receipt_not_finalized"
  | "terminal_status_missing"
  | "terminal_status_not_succeeded"
  | "source_mismatch"
  | "target_agent_mismatch"
  | "resolved_model_mismatch"
  | "final_model_mismatch"
  | "runtime_mismatch"
  | "context_mode_mismatch"
  | "fallback_used";

export type TaskExecutionAdmissionFailure = {
  code: TaskExecutionAdmissionFailureCode;
  detail: string;
};

export type TaskExecutionCheckExpectedRoute = {
  source: {
    kind: "plugin";
    id: string;
    hook: string;
  };
  targetAgentId: string;
  model: string;
  runtime: "openclaw";
  contextMode?: string;
};
export type TaskExecutionAdmissionExpectedRoute = TaskExecutionCheckExpectedRoute;

export type TaskExecutionCheckResult = {
  passed: boolean;
  /** Compatibility field for the older CLI wording. Prefer `passed`. */
  admitted: boolean;
  check: TaskExecutionCheck;
  lookup: string;
  taskId?: string;
  runId?: string;
  expected: TaskExecutionCheckExpectedRoute;
  failures: TaskExecutionAdmissionFailure[];
  receipt?: AgentRunReceipt;
};
export type TaskExecutionAdmissionResult = TaskExecutionCheckResult;

export function parseTaskExecutionCheck(value: string): TaskExecutionCheck | null {
  return value.trim() === "gbrain.signal_detector" ? "gbrain.signal_detector" : null;
}
export const parseTaskExecutionAdmissionCheck = parseTaskExecutionCheck;

export function resolveTaskExecutionCheckExpectedRoute(
  check: TaskExecutionCheck,
): TaskExecutionCheckExpectedRoute {
  switch (check) {
    case "gbrain.signal_detector":
      return {
        source: {
          kind: "plugin",
          id: "gbrain-context",
          hook: "message_received",
        },
        targetAgentId: "memory-curator",
        model: "openrouter/anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        contextMode: "lightweight",
      };
  }
}
export const resolveTaskExecutionAdmissionExpectedRoute = resolveTaskExecutionCheckExpectedRoute;

function pushMismatch(
  failures: TaskExecutionAdmissionFailure[],
  params: {
    code: TaskExecutionAdmissionFailureCode;
    label: string;
    expected?: string;
    actual?: string;
  },
) {
  failures.push({
    code: params.code,
    detail: `${params.label}: expected ${params.expected ?? "present"}, got ${
      params.actual ?? "missing"
    }`,
  });
}

function validateReceipt(params: {
  receipt: AgentRunReceipt;
  expected: TaskExecutionCheckExpectedRoute;
}): TaskExecutionAdmissionFailure[] {
  const failures: TaskExecutionAdmissionFailure[] = [];
  const { receipt, expected } = params;
  const expectedModelKey = normalizeModelRefStringForComparison(expected.model);

  if (receipt.phase !== "finalized") {
    pushMismatch(failures, {
      code: "receipt_not_finalized",
      label: "receipt.phase",
      expected: "finalized",
      actual: receipt.phase,
    });
  }
  if (!receipt.terminalStatus) {
    pushMismatch(failures, {
      code: "terminal_status_missing",
      label: "receipt.terminalStatus",
      expected: "succeeded",
    });
  } else if (receipt.terminalStatus !== "succeeded") {
    pushMismatch(failures, {
      code: "terminal_status_not_succeeded",
      label: "receipt.terminalStatus",
      expected: "succeeded",
      actual: receipt.terminalStatus,
    });
  }
  if (
    receipt.source.kind !== expected.source.kind ||
    receipt.source.id !== expected.source.id ||
    receipt.source.hook !== expected.source.hook
  ) {
    failures.push({
      code: "source_mismatch",
      detail: `receipt.source: expected ${expected.source.kind}/${expected.source.id}/${expected.source.hook}, got ${receipt.source.kind}/${receipt.source.id ?? "missing"}/${receipt.source.hook ?? "missing"}`,
    });
  }
  if (receipt.targetAgentId !== expected.targetAgentId) {
    pushMismatch(failures, {
      code: "target_agent_mismatch",
      label: "receipt.targetAgentId",
      expected: expected.targetAgentId,
      actual: receipt.targetAgentId,
    });
  }
  if (normalizeModelRefStringForComparison(receipt.resolved.model) !== expectedModelKey) {
    pushMismatch(failures, {
      code: "resolved_model_mismatch",
      label: "receipt.resolved.model",
      expected: expected.model,
      actual: receipt.resolved.model,
    });
  }
  if (receipt.resolved.runtime !== expected.runtime) {
    pushMismatch(failures, {
      code: "runtime_mismatch",
      label: "receipt.resolved.runtime",
      expected: expected.runtime,
      actual: receipt.resolved.runtime,
    });
  }
  if (expected.contextMode && receipt.resolved.contextMode !== expected.contextMode) {
    pushMismatch(failures, {
      code: "context_mode_mismatch",
      label: "receipt.resolved.contextMode",
      expected: expected.contextMode,
      actual: receipt.resolved.contextMode,
    });
  }
  if (!receipt.final) {
    pushMismatch(failures, {
      code: "final_model_mismatch",
      label: "receipt.final.model",
      expected: expected.model,
    });
  } else {
    if (normalizeModelRefStringForComparison(receipt.final.model) !== expectedModelKey) {
      pushMismatch(failures, {
        code: "final_model_mismatch",
        label: "receipt.final.model",
        expected: expected.model,
        actual: receipt.final.model,
      });
    }
    if (receipt.final.runtime !== expected.runtime) {
      pushMismatch(failures, {
        code: "runtime_mismatch",
        label: "receipt.final.runtime",
        expected: expected.runtime,
        actual: receipt.final.runtime,
      });
    }
    if (expected.contextMode && receipt.final.contextMode !== expected.contextMode) {
      pushMismatch(failures, {
        code: "context_mode_mismatch",
        label: "receipt.final.contextMode",
        expected: expected.contextMode,
        actual: receipt.final.contextMode,
      });
    }
  }
  if (receipt.fallback.used) {
    failures.push({
      code: "fallback_used",
      detail: `receipt.fallback.used: expected false, got true${
        receipt.fallback.reason ? ` (${receipt.fallback.reason})` : ""
      }`,
    });
  }

  return failures;
}

export function checkTaskExecutionReceipt(params: {
  check: TaskExecutionCheck;
  lookup: string;
  task?: TaskRecord;
}): TaskExecutionCheckResult {
  const expected = resolveTaskExecutionCheckExpectedRoute(params.check);
  if (!params.task) {
    return {
      passed: false,
      admitted: false,
      check: params.check,
      lookup: params.lookup,
      expected,
      failures: [
        {
          code: "task_not_found",
          detail: `task lookup not found: ${params.lookup}`,
        },
      ],
    };
  }
  const receipt = params.task.executionReceipt;
  if (!receipt) {
    return {
      passed: false,
      admitted: false,
      check: params.check,
      lookup: params.lookup,
      taskId: params.task.taskId,
      ...(params.task.runId ? { runId: params.task.runId } : {}),
      expected,
      failures: [
        {
          code: "receipt_missing",
          detail: `task has no executionReceipt: ${params.task.taskId}`,
        },
      ],
    };
  }
  const failures = validateReceipt({ receipt, expected });
  const passed = failures.length === 0;
  return {
    passed,
    admitted: passed,
    check: params.check,
    lookup: params.lookup,
    taskId: params.task.taskId,
    ...(params.task.runId ? { runId: params.task.runId } : {}),
    expected,
    failures,
    receipt,
  };
}

export const admitTaskExecutionReceipt = checkTaskExecutionReceipt;
