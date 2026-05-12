import { buildBuiltinChatCommands } from "../../../../src/auto-reply/commands-registry.shared.js";

export type ProtocolPreGateSourceRoute =
  | "ux"
  | "terminal"
  | "work_queue"
  | "agent_handoff"
  | "api"
  | "http"
  | "service";

export type ProtocolPreGateControl =
  | "pause"
  | "redirect"
  | "cancel"
  | "retry"
  | "needs_review"
  | "approve"
  | "rollback"
  | "inspect_artifact"
  | "compare_runs"
  | "resume";

export type ProtocolPreGateCommand = string;

export type ProtocolPreGateAuthMetadata = {
  authenticated?: boolean;
  actorId?: string | null;
  sessionId?: string | null;
};

export type ProtocolPreGateControlPayload = {
  control: ProtocolPreGateControl | string;
  targetRef?: string | null;
};

export type ProtocolPreGateInput = {
  text?: string | null;
  sourceRoute: ProtocolPreGateSourceRoute;
  auth?: ProtocolPreGateAuthMetadata | null;
  requireAuthentication?: boolean;
  uiControl?: ProtocolPreGateControlPayload | null;
  targetRefs?: string[];
  requestId?: string | null;
  sessionId?: string | null;
  contentMetadata?: {
    hasFileOnlyInput?: boolean;
    hasText?: boolean;
    inputByteLength?: number;
  };
};

export type ProtocolPreGateProtocolCommandResult = {
  kind: "protocol_command";
  command: ProtocolPreGateCommand;
  args: string;
  known: boolean;
  matchedName: string | null;
  sourceRoute: ProtocolPreGateSourceRoute;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ProtocolPreGateUiControlResult = {
  kind: "ui_control";
  control: ProtocolPreGateControl;
  targetRef: string | null;
  sourceRoute: ProtocolPreGateSourceRoute;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ProtocolPreGateRejectResult = {
  kind: "reject";
  statusCode: number;
  reasonCode: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ProtocolPreGateContinueResult = {
  kind: "continue_to_intent_routing";
  sourceRoute: ProtocolPreGateSourceRoute;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ProtocolPreGateResult =
  | ProtocolPreGateProtocolCommandResult
  | ProtocolPreGateUiControlResult
  | ProtocolPreGateRejectResult
  | ProtocolPreGateContinueResult;

const SUPPORTED_UI_CONTROLS = new Set<ProtocolPreGateControl>([
  "pause",
  "redirect",
  "cancel",
  "retry",
  "needs_review",
  "approve",
  "rollback",
  "inspect_artifact",
  "compare_runs",
  "resume",
]);

const UI_ONLY_PROTOCOL_SLASH_COMMANDS = [
  { key: "clear", textAliases: ["/clear"] },
  { key: "redirect", textAliases: ["/redirect"] },
] as const;

export type ProtocolSlashCommandEntry = {
  key: string;
  names: string[];
};

export function normalizeProtocolSlashIdentifier(raw: string): string | null {
  const normalized = raw.trim().replace(/^\//u, "").toLowerCase().replace(/_/gu, "-");
  return /^[a-z0-9][a-z0-9-]*$/u.test(normalized) ? normalized : null;
}

export function listKnownProtocolSlashCommands(): ProtocolSlashCommandEntry[] {
  const entries = new Map<string, Set<string>>();
  const add = (key: string, aliases: readonly string[]) => {
    const normalizedKey = normalizeProtocolSlashIdentifier(key);
    if (!normalizedKey) {
      return;
    }
    const names = entries.get(normalizedKey) ?? new Set<string>();
    names.add(normalizedKey);
    for (const alias of aliases) {
      const normalizedAlias = normalizeProtocolSlashIdentifier(alias);
      if (normalizedAlias) {
        names.add(normalizedAlias);
      }
    }
    entries.set(normalizedKey, names);
  };
  for (const command of buildBuiltinChatCommands()) {
    add(command.key, command.textAliases);
  }
  for (const command of UI_ONLY_PROTOCOL_SLASH_COMMANDS) {
    add(command.key, command.textAliases);
  }
  return Array.from(entries.entries()).map(([key, names]) => ({
    key,
    names: Array.from(names).toSorted(),
  }));
}

function resolveProtocolSlashCommand(name: string): {
  command: ProtocolPreGateCommand;
  matchedName: string | null;
  known: boolean;
} {
  const normalized = normalizeProtocolSlashIdentifier(name);
  if (!normalized) {
    return { command: "unknown", matchedName: null, known: false };
  }
  for (const entry of listKnownProtocolSlashCommands()) {
    if (entry.names.includes(normalized)) {
      return { command: entry.key, matchedName: normalized, known: true };
    }
  }
  return { command: "unknown", matchedName: normalized, known: false };
}

export function normalizeProtocolControl(control: string): ProtocolPreGateControl | null {
  const normalized = control
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/gu, "_");
  if (normalized === "mark_needs_review" || normalized === "needs_review") {
    return "needs_review";
  }
  return SUPPORTED_UI_CONTROLS.has(normalized as ProtocolPreGateControl)
    ? (normalized as ProtocolPreGateControl)
    : null;
}

export function parseProtocolSlashCommand(input: string): {
  command: ProtocolPreGateCommand;
  args: string;
  known: boolean;
  matchedName: string | null;
} | null {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const body = trimmed.slice(1);
  const separatorIndex = body.search(/[\s:]/u);
  const rawCommand = separatorIndex === -1 ? body : body.slice(0, separatorIndex);
  if (!rawCommand) {
    return { command: "unknown", args: "", known: false, matchedName: null };
  }
  let args = separatorIndex === -1 ? "" : body.slice(separatorIndex).trimStart();
  if (args.startsWith(":")) {
    args = args.slice(1).trimStart();
  }
  const resolved = resolveProtocolSlashCommand(rawCommand);
  return { ...resolved, args: args.trim() };
}

export function runProtocolPreGate(input: ProtocolPreGateInput): ProtocolPreGateResult {
  if (input.requireAuthentication === true) {
    const actorId = input.auth?.actorId?.trim() ?? "";
    if (input.auth?.authenticated !== true) {
      return reject(401, "authenticated_operator_required");
    }
    if (!actorId) {
      return reject(401, "operator_actor_id_required");
    }
  }

  if (input.uiControl) {
    const control = normalizeProtocolControl(input.uiControl.control);
    if (!control) {
      return reject(400, "unknown_ui_control");
    }
    return {
      kind: "ui_control",
      control,
      targetRef: input.uiControl.targetRef?.trim() || null,
      sourceRoute: input.sourceRoute,
      reasonCodes: ["explicit_ui_control_bypasses_model_routing"],
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }

  const text = input.text ?? "";
  const hasText = input.contentMetadata?.hasText ?? text.trim().length > 0;
  if (!hasText && input.contentMetadata?.hasFileOnlyInput === true) {
    return {
      kind: "continue_to_intent_routing",
      sourceRoute: input.sourceRoute,
      reasonCodes: ["file_only_input_requires_later_context_resolution"],
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }

  if (!text.trim()) {
    return reject(400, "empty_input");
  }

  const slashCommand = parseProtocolSlashCommand(text);
  if (slashCommand) {
    return {
      kind: "protocol_command",
      command: slashCommand.command,
      args: slashCommand.args,
      known: slashCommand.known,
      matchedName: slashCommand.matchedName,
      sourceRoute: input.sourceRoute,
      reasonCodes: [
        slashCommand.known ? "known_slash_command_bypasses_model_routing" : "unknown_slash_command",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }

  return {
    kind: "continue_to_intent_routing",
    sourceRoute: input.sourceRoute,
    reasonCodes: ["free_form_input_requires_intent_routing"],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function reject(statusCode: number, reasonCode: string): ProtocolPreGateRejectResult {
  return {
    kind: "reject",
    statusCode,
    reasonCode,
    reasonCodes: [reasonCode],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
