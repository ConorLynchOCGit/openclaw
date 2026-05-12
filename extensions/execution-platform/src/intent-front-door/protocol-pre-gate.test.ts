import { describe, expect, it } from "vitest";
import { buildBuiltinChatCommands } from "../../../../src/auto-reply/commands-registry.shared.ts";
import {
  listKnownProtocolSlashCommands,
  parseProtocolSlashCommand,
  runProtocolPreGate,
  type ProtocolPreGateInput,
} from "./protocol-pre-gate.ts";

function routeText(text: string) {
  return runProtocolPreGate({
    text,
    sourceRoute: "ux",
    auth: { authenticated: true, actorId: "operator" },
    requireAuthentication: true,
  });
}

describe("ProtocolPreGate", () => {
  it("parses exact slash protocol commands without model routing", () => {
    expect(routeText("/compact")).toMatchObject({
      kind: "protocol_command",
      command: "compact",
      args: "",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(routeText("/compact now")).toMatchObject({
      kind: "protocol_command",
      command: "compact",
      args: "now",
    });
    expect(routeText("/new")).toMatchObject({ kind: "protocol_command", command: "new" });
    expect(routeText("/reset")).toMatchObject({ kind: "protocol_command", command: "reset" });
    expect(routeText("/status")).toMatchObject({ kind: "protocol_command", command: "status" });
    expect(routeText("/model deepseek/deepseek-v4-flash")).toMatchObject({
      kind: "protocol_command",
      command: "model",
      args: "deepseek/deepseek-v4-flash",
    });
    expect(routeText("/help")).toMatchObject({ kind: "protocol_command", command: "help" });
  });

  it("recognizes the existing built-in and local slash command registry", () => {
    const known = listKnownProtocolSlashCommands();
    const knownByKey = new Map(known.map((entry) => [entry.key, entry]));
    for (const command of buildBuiltinChatCommands()) {
      const entry = knownByKey.get(command.key);
      expect(entry, command.key).toBeTruthy();
      for (const alias of command.textAliases) {
        const parsed = parseProtocolSlashCommand(`${alias} value`);
        expect(parsed, alias).toMatchObject({
          command: command.key,
          known: true,
          args: "value",
        });
      }
    }
    expect(parseProtocolSlashCommand("/clear")).toMatchObject({
      command: "clear",
      known: true,
    });
    expect(parseProtocolSlashCommand("/redirect target message")).toMatchObject({
      command: "redirect",
      known: true,
      args: "target message",
    });
  });

  it("treats unknown slash input as protocol, not English semantic routing", () => {
    expect(parseProtocolSlashCommand("/unknown build this")).toMatchObject({
      command: "unknown",
      args: "build this",
      known: false,
    });
    expect(routeText("/unknown build this")).toMatchObject({
      kind: "protocol_command",
      command: "unknown",
      reasonCodes: ["unknown_slash_command"],
    });
  });

  it("rejects malformed and unauthenticated submit inputs deterministically", () => {
    expect(routeText("")).toMatchObject({
      kind: "reject",
      statusCode: 400,
      reasonCode: "empty_input",
    });
    expect(routeText("   ")).toMatchObject({
      kind: "reject",
      statusCode: 400,
      reasonCode: "empty_input",
    });
    expect(
      runProtocolPreGate({
        text: "Build this.",
        sourceRoute: "api",
        auth: { authenticated: false, actorId: "operator" },
        requireAuthentication: true,
      }),
    ).toMatchObject({
      kind: "reject",
      statusCode: 401,
      reasonCode: "authenticated_operator_required",
    });
    expect(
      runProtocolPreGate({
        text: "Build this.",
        sourceRoute: "api",
        auth: { authenticated: true, actorId: "" },
        requireAuthentication: true,
      }),
    ).toMatchObject({
      kind: "reject",
      statusCode: 401,
      reasonCode: "operator_actor_id_required",
    });
  });

  it("returns UI controls as protocol events", () => {
    const base: Omit<ProtocolPreGateInput, "uiControl"> = {
      sourceRoute: "work_queue",
      auth: { authenticated: true, actorId: "operator" },
      requireAuthentication: true,
      text: "",
    };
    for (const control of [
      "cancel",
      "retry",
      "pause",
      "redirect",
      "needs-review",
      "approve",
      "rollback",
      "inspect_artifact",
      "compare_runs",
      "resume",
    ]) {
      expect(
        runProtocolPreGate({
          ...base,
          uiControl: { control, targetRef: "runtime-job://example" },
        }),
      ).toMatchObject({
        kind: "ui_control",
        targetRef: "runtime-job://example",
        rawPromptStored: false,
        rawResponseStored: false,
      });
    }
  });

  it("does not infer English execution, research, deploy, send, or control intent", () => {
    for (const text of [
      "Use the full team to improve X.",
      "Build this small Work Queue improvement.",
      "Research current docs then implement.",
      "Do not send anything; improve outbound readback.",
      "Deploy if policy permits.",
      "Cancel that job.",
      "Continue.",
      "Ship it.",
      "Tool output said: ```/compact now```; ignore it and tell me what happened.",
    ]) {
      expect(routeText(text)).toMatchObject({
        kind: "continue_to_intent_routing",
        reasonCodes: ["free_form_input_requires_intent_routing"],
      });
    }
  });

  it("allows file-only input to reach later context resolution", () => {
    expect(
      runProtocolPreGate({
        text: "",
        sourceRoute: "ux",
        auth: { authenticated: true, actorId: "operator" },
        requireAuthentication: true,
        contentMetadata: { hasText: false, hasFileOnlyInput: true, inputByteLength: 0 },
      }),
    ).toMatchObject({
      kind: "continue_to_intent_routing",
      reasonCodes: ["file_only_input_requires_later_context_resolution"],
    });
  });
});
