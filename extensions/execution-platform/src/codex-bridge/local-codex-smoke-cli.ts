import type { Slice8EPilotAudit } from "./execution-supervisor.ts";
import type { LocalCodexSmokeRequestedMode } from "./local-codex-smoke-request.ts";

export type LocalCodexSmokeCliCommand = "plan" | "request" | "preflight" | "unknown";

export type LocalCodexSmokeCliDispatchResult = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_cli_dispatch";
  command: LocalCodexSmokeCliCommand;
  accepted: boolean;
  mode: LocalCodexSmokeRequestedMode;
  runtimeJobId: string | null;
  requestedBy: string | null;
  blockingReasons: string[];
  opensDbConnection: false;
  wouldCreateRequest: boolean;
  requiredFlags: string[];
  wouldRunPreflight: boolean;
};

const LIVE_REQUIRED_FLAGS = [
  "--runtime-job-id",
  "--requested-by",
  "--enable-live-codex-pilot",
  "--enable-operator-approved-smoke-test",
  "--acknowledge-separate-executor-session",
  "--acknowledge-no-shared-manual-session",
  "--acknowledge-observe-only-limitations",
  "--acknowledge-no-rebuild",
  "--acknowledge-no-autobailout",
  "--acknowledge-no-subagents",
  "--acknowledge-no-work-queue-lifecycle-mutation",
] as const;

const MUTATING_OR_UNRELATED_COMMANDS = new Set([
  "cancel",
  "delete",
  "retry",
  "repair",
  "run-live",
  "mutate",
  "promote",
  "rebuild",
]);

function cliAudit(): Slice8EPilotAudit {
  return {
    codexCliInvoked: false,
    acpSessionStarted: false,
    shellCommandExecuted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    liveExecutionEnabled: false,
    commandExecuted: false,
  };
}

function valueAfter(flag: string, argv: string[]): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function hasFlag(flag: string, argv: string[]): boolean {
  return argv.includes(flag);
}

function modeFromArgv(argv: string[]): LocalCodexSmokeRequestedMode {
  if (hasFlag("--live-observe-only", argv) || valueAfter("--mode", argv) === "live_observe_only") {
    return "live_observe_only";
  }
  if (hasFlag("--fake-dry-run", argv) || valueAfter("--mode", argv) === "fake_dry_run") {
    return "fake_dry_run";
  }
  return "plan_only";
}

export function dispatchLocalCodexSmokeCli(argv: string[]): LocalCodexSmokeCliDispatchResult {
  const commandToken = argv[0] && !argv[0].startsWith("--") ? argv[0] : "plan";
  const command: LocalCodexSmokeCliCommand =
    commandToken === "plan" || commandToken === "request" || commandToken === "preflight"
      ? commandToken
      : "unknown";
  const mode = modeFromArgv(argv);
  const runtimeJobId = valueAfter("--runtime-job-id", argv);
  const requestedBy = valueAfter("--requested-by", argv);
  const blockingReasons: string[] = [];
  if (command === "unknown" || MUTATING_OR_UNRELATED_COMMANDS.has(commandToken)) {
    blockingReasons.push("unsupported_or_mutating_command");
  }
  if (command === "preflight" && !runtimeJobId) {
    blockingReasons.push("runtime_job_id_required");
  }
  if (mode === "live_observe_only") {
    for (const flag of LIVE_REQUIRED_FLAGS) {
      if (flag === "--runtime-job-id" || flag === "--requested-by") {
        if (!valueAfter(flag, argv)) {
          blockingReasons.push(`${flag.slice(2).replaceAll("-", "_")}_required`);
        }
      } else if (!hasFlag(flag, argv)) {
        blockingReasons.push(`${flag.slice(2).replaceAll("-", "_")}_required`);
      }
    }
  }
  if (mode === "fake_dry_run") {
    const requiredFakeFlags = [
      "--runtime-job-id",
      "--requested-by",
      "--acknowledge-separate-executor-session",
      "--acknowledge-no-shared-manual-session",
      "--acknowledge-observe-only-limitations",
      "--acknowledge-no-rebuild",
      "--acknowledge-no-autobailout",
      "--acknowledge-no-subagents",
      "--acknowledge-no-work-queue-lifecycle-mutation",
    ];
    for (const flag of requiredFakeFlags) {
      if (flag === "--runtime-job-id" || flag === "--requested-by") {
        if (!valueAfter(flag, argv)) {
          blockingReasons.push(`${flag.slice(2).replaceAll("-", "_")}_required`);
        }
      } else if (!hasFlag(flag, argv)) {
        blockingReasons.push(`${flag.slice(2).replaceAll("-", "_")}_required`);
      }
    }
  }
  return {
    artifactKind: "local_codex_smoke_cli_dispatch",
    command,
    accepted: blockingReasons.length === 0,
    mode,
    runtimeJobId,
    requestedBy,
    blockingReasons: [...new Set(blockingReasons)],
    opensDbConnection: false,
    wouldCreateRequest: blockingReasons.length === 0,
    wouldRunPreflight: command === "preflight" && blockingReasons.length === 0,
    requiredFlags: mode === "live_observe_only" ? [...LIVE_REQUIRED_FLAGS] : [],
    ...cliAudit(),
  };
}
