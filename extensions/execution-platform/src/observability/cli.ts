import type { RuntimeJobState } from "../runtime-job-repository.ts";
import type { ExecutionPlatformObservabilityService } from "./observability-service.ts";
import type { ObservabilityDiagnostic } from "./types.ts";

export type ObservabilityCliResult =
  | {
      ok: true;
      command: string;
      diagnostic: ObservabilityDiagnostic | ObservabilityDiagnostic[];
    }
  | {
      ok: false;
      command: string;
      error: string;
    };

const MUTATING_COMMANDS = new Set([
  "ack",
  "cancel",
  "complete",
  "delete",
  "enqueue",
  "fail",
  "repair",
  "retry",
  "run",
  "start",
]);

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function dispatchObservabilityCliCommand(
  service: ExecutionPlatformObservabilityService,
  args: string[],
): Promise<ObservabilityCliResult> {
  const [command, subject, id] = args;
  const commandName = [command, subject].filter(Boolean).join(" ");
  if (!command || MUTATING_COMMANDS.has(command)) {
    return {
      ok: false,
      command: command ?? "",
      error: "mutating or missing command rejected; diagnostics are read-only",
    };
  }
  if (command === "inspect") {
    if (!subject || !id) {
      return { ok: false, command: commandName, error: "inspect requires a subject and id" };
    }
    if (subject === "runtime-job") {
      return {
        ok: true,
        command: commandName,
        diagnostic: await service.inspectRuntimeJob(id),
      };
    }
    if (subject === "model-task") {
      return {
        ok: true,
        command: commandName,
        diagnostic: await service.inspectModelTask(id),
      };
    }
    if (subject === "db-operation") {
      return {
        ok: true,
        command: commandName,
        diagnostic: await service.inspectDbOperation(id),
      };
    }
    if (subject === "work-item") {
      return {
        ok: true,
        command: commandName,
        diagnostic: await service.inspectWorkQueueItem(id),
      };
    }
    if (subject === "script-job") {
      return {
        ok: true,
        command: commandName,
        diagnostic: await service.inspectScriptJob(id),
      };
    }
    return { ok: false, command: commandName, error: `unsupported inspect subject: ${subject}` };
  }
  if (command === "list" && subject === "runtime-jobs") {
    const state = readFlag(args, "--state");
    const queueName = readFlag(args, "--queue");
    const jobType = readFlag(args, "--type");
    return {
      ok: true,
      command: commandName,
      diagnostic: await service.listRecentRuntimeJobs({
        states: state ? [state as RuntimeJobState] : undefined,
        queueName,
        jobTypes: jobType ? [jobType] : undefined,
      }),
    };
  }
  return {
    ok: false,
    command: commandName,
    error: "unsupported read-only diagnostic command",
  };
}
