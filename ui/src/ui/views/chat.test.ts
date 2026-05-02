/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { getSafeLocalStorage } from "../../local-storage.ts";
import { renderChatSessionSelect } from "../app-render.helpers.ts";
import type { AppViewState } from "../app-view-state.ts";
import {
  createModelCatalog,
  createSessionsListResult,
  DEEPSEEK_CHAT_MODEL,
  DEFAULT_CHAT_MODEL_CATALOG,
} from "../chat-model.test-helpers.ts";
import { resetAssistantAttachmentAvailabilityCacheForTest } from "../chat/grouped-render.ts";
import { normalizeMessage } from "../chat/message-normalizer.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  ModelCatalogEntry,
  ProactivityInboxItem,
  ProductProactivityQueueItem,
  SessionsListResult,
} from "../types.ts";
import { renderChat, type ChatProps } from "./chat.ts";
import { renderOverview, type OverviewProps } from "./overview.ts";

function createSessions(): SessionsListResult {
  return {
    ts: 0,
    path: "",
    count: 0,
    defaults: { modelProvider: null, model: null, contextTokens: null },
    sessions: [],
  };
}

function createChatHeaderState(
  overrides: {
    model?: string | null;
    modelProvider?: string | null;
    models?: ModelCatalogEntry[];
    omitSessionFromList?: boolean;
  } = {},
): { state: AppViewState; request: ReturnType<typeof vi.fn> } {
  let currentModel = overrides.model ?? null;
  let currentModelProvider = overrides.modelProvider ?? (currentModel ? "openai" : null);
  const omitSessionFromList = overrides.omitSessionFromList ?? false;
  const catalog = overrides.models ?? createModelCatalog(...DEFAULT_CHAT_MODEL_CATALOG);
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "sessions.patch") {
      const nextModel = (params.model as string | null | undefined) ?? null;
      if (!nextModel) {
        currentModel = null;
        currentModelProvider = null;
      } else {
        const normalized = nextModel.trim();
        const slashIndex = normalized.indexOf("/");
        if (slashIndex > 0) {
          currentModelProvider = normalized.slice(0, slashIndex);
          currentModel = normalized.slice(slashIndex + 1);
        } else {
          currentModel = normalized;
          const matchingProviders = catalog
            .filter((entry) => entry.id === normalized)
            .map((entry) => entry.provider)
            .filter(Boolean);
          currentModelProvider =
            matchingProviders.length === 1 ? matchingProviders[0] : currentModelProvider;
        }
      }
      return { ok: true, key: "main" };
    }
    if (method === "chat.history") {
      return { messages: [], thinkingLevel: null };
    }
    if (method === "sessions.list") {
      return createSessionsListResult({
        model: currentModel,
        modelProvider: currentModelProvider,
        omitSessionFromList,
      });
    }
    if (method === "models.list") {
      return { models: catalog };
    }
    if (method === "tools.effective") {
      return {
        agentId: "main",
        profile: "coding",
        groups: [],
      };
    }
    throw new Error(`Unexpected request: ${method}`);
  });
  const state = {
    sessionKey: "main",
    connected: true,
    sessionsHideCron: true,
    sessionsResult: createSessionsListResult({
      model: currentModel,
      modelProvider: currentModelProvider,
      omitSessionFromList,
    }),
    chatModelOverrides: {},
    chatModelCatalog: catalog,
    chatModelsLoading: false,
    client: { request } as unknown as GatewayBrowserClient,
    settings: {
      gatewayUrl: "",
      token: "",
      locale: "en",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "dark",
      splitRatio: 0.6,
      navCollapsed: false,
      navGroupsCollapsed: {},
      borderRadius: 50,
      chatFocusMode: false,
      chatShowThinking: false,
    },
    chatMessage: "",
    chatStream: null,
    chatStreamStartedAt: null,
    chatRunId: null,
    chatQueue: [],
    chatMessages: [],
    chatLoading: false,
    chatThinkingLevel: null,
    lastError: null,
    chatAvatarUrl: null,
    basePath: "",
    hello: null,
    agentsList: null,
    agentsPanel: "overview",
    agentsSelectedId: null,
    toolsEffectiveLoading: false,
    toolsEffectiveLoadingKey: null,
    toolsEffectiveResultKey: null,
    toolsEffectiveError: null,
    toolsEffectiveResult: null,
    applySettings(next: AppViewState["settings"]) {
      state.settings = next;
    },
    loadAssistantIdentity: vi.fn(),
    resetToolStream: vi.fn(),
    resetChatScroll: vi.fn(),
  } as unknown as AppViewState & {
    client: GatewayBrowserClient;
    settings: AppViewState["settings"];
  };
  return { state, request };
}

function flushTasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    sessionKey: "main",
    onSessionKeyChange: () => undefined,
    thinkingLevel: null,
    showThinking: false,
    showToolCalls: true,
    loading: false,
    sending: false,
    canAbort: false,
    compactionStatus: null,
    fallbackStatus: null,
    messages: [],
    sideResult: null,
    toolMessages: [],
    streamSegments: [],
    stream: null,
    streamStartedAt: null,
    assistantAvatarUrl: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    sessions: createSessions(),
    focusMode: false,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    localMediaPreviewRoots: [],
    onRefresh: () => undefined,
    onToggleFocusMode: () => undefined,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onQueueRemove: () => undefined,
    onDismissSideResult: () => undefined,
    onNewSession: () => undefined,
    agentsList: null,
    currentAgentId: "",
    onAgentChange: () => undefined,
    ...overrides,
  };
}

function createOverviewProps(overrides: Partial<OverviewProps> = {}): OverviewProps {
  return {
    warnQueryToken: false,
    connected: false,
    hello: null,
    settings: {
      gatewayUrl: "",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
      borderRadius: 50,
      locale: "en",
    },
    password: "",
    lastError: null,
    lastErrorCode: null,
    presenceCount: 0,
    sessionsCount: null,
    cronEnabled: null,
    cronNext: null,
    lastChannelsRefresh: null,
    modelAuthStatus: null,
    usageResult: null,
    sessionsResult: null,
    skillsReport: null,
    cronJobs: [],
    cronStatus: null,
    attentionItems: [],
    eventLog: [],
    overviewLogLines: [],
    showGatewayToken: false,
    showGatewayPassword: false,
    onSettingsChange: () => undefined,
    onPasswordChange: () => undefined,
    onSessionKeyChange: () => undefined,
    onToggleGatewayTokenVisibility: () => undefined,
    onToggleGatewayPasswordVisibility: () => undefined,
    onConnect: () => undefined,
    onRefresh: () => undefined,
    onNavigate: () => undefined,
    onRefreshLogs: () => undefined,
    ...overrides,
  };
}

describe("chat view", () => {
  it("renders BTW side results outside transcript history", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Saved transcript message" }],
              timestamp: 1,
            },
          ],
          sideResult: {
            kind: "btw",
            runId: "btw-run-1",
            sessionKey: "main",
            question: "what changed?",
            text: "The web UI now renders **BTW** separately.",
            isError: false,
            ts: 2,
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-side-result")).not.toBeNull();
    expect(container.textContent).toContain("BTW");
    expect(container.textContent).toContain("what changed?");
    expect(container.textContent).toContain("Not saved to chat history");
    expect(container.textContent).toContain("Saved transcript message");
    expect(container.querySelectorAll(".chat-side-result")).toHaveLength(1);
  });

  it("keeps full long assistant responses available behind a compact preview", () => {
    const container = document.createElement("div");
    const longResponse = `${"Long response line\n".repeat(120)}FINAL-MARKER`;
    const onOpenSidebar = vi.fn();

    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "assistant",
              content: longResponse,
              timestamp: 1000,
            },
          ],
          onOpenSidebar,
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Preview only. Full response preserved");
    const inlineRemainder = container.querySelector(".chat-full-response");
    expect(inlineRemainder).not.toBeNull();
    expect(container.textContent?.match(/Long response line/g)).toHaveLength(120);
    expect(inlineRemainder?.textContent?.match(/Long response line/g)).toHaveLength(40);
    expect(container.textContent).toContain("FINAL-MARKER");
    expect(container.textContent).toContain("Open full");
    expect(container.textContent).toContain("Copy as markdown");
    expect(container.textContent).toContain("Export");
  });

  it("renders queued prompts inline instead of a detached queue list", () => {
    const container = document.createElement("div");
    const onQueueRemove = vi.fn();
    const onDraftChange = vi.fn();

    render(
      renderChat(
        createProps({
          queue: [
            {
              id: "queued-1",
              text: "queued prompt text",
              createdAt: 1000,
            },
          ],
          onQueueRemove,
          onDraftChange,
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-queued-prompt")).not.toBeNull();
    expect(container.textContent).toContain("Queued #1");
    expect(container.textContent).toContain("queued prompt text");
    expect(container.querySelector(".chat-queue")).toBeNull();
  });

  it("renders memory activity as collapsible timeline metadata instead of assistant bubbles", () => {
    const container = document.createElement("div");

    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "assistant",
              content:
                "[Memory Activity] retrieval completed | request_id=req_1 | selected_ids=mem_1",
              timestamp: 1000,
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-memory-activity")).not.toBeNull();
    expect(container.querySelector(".chat-group.assistant")).toBeNull();
    expect(container.textContent).toContain("retrieval checked");
  });

  it("renders structured memory activity as tool-like metadata instead of assistant bubbles", () => {
    const container = document.createElement("div");

    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Memory activity" }],
              timestamp: 1000,
              __openclaw: {
                kind: "model_memory_activity",
                schemaVersion: 1,
                eventType: "memory_retrieval_checked",
                label: "retrieval completed",
                status: "completed",
                ids: {
                  retrievalRequestId: ["req_1"],
                  selectedMemoryIds: ["mem_1"],
                },
                rawContentPersisted: false,
                containsPromptText: false,
                containsTranscript: false,
                containsRawToolLog: false,
              },
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-memory-activity--tool-like")).not.toBeNull();
    expect(container.querySelector(".chat-group.assistant")).toBeNull();
    expect(container.textContent).toContain("memory retrieval checked");
    expect(container.textContent).toContain("retrievalRequestId=req_1");
    expect(container.textContent).not.toContain("[Memory Activity]");
  });

  it("renders structured turn activity as tool-like metadata instead of assistant bubbles", () => {
    const container = document.createElement("div");

    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Turn activity: tool completed: memory_search" }],
              timestamp: 1000,
              __openclaw: {
                kind: "turn_activity",
                schemaVersion: 1,
                eventType: "tool_completed",
                label: "tool completed: memory_search",
                status: "completed",
                ids: {
                  toolCallId: ["call_1"],
                },
                labels: {
                  tool: "memory_search",
                },
              },
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-memory-activity--tool-like")).not.toBeNull();
    expect(container.querySelector(".chat-group.assistant")).toBeNull();
    expect(container.textContent).toContain("tool completed: memory_search");
    expect(container.textContent).toContain("tool completed");
    expect(container.textContent).toContain("toolCallId=call_1");
  });

  it("shows a stable working card while a run is active", () => {
    const container = document.createElement("div");

    render(
      renderChat(
        createProps({
          runId: "run-working-1",
          sending: true,
          stream: "",
          streamStartedAt: 1000,
          canAbort: true,
          onAbort: vi.fn(),
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-run-status")).not.toBeNull();
    expect(container.textContent).toContain("Working...");
    expect(container.textContent).toContain("retrieving memory");
    expect(container.textContent).toContain("elapsed");
    expect(container.textContent).toContain("run run-working-1");
    expect(container.textContent).toContain("Cancel");
    expect(container.textContent).toContain("Retry unavailable");
    expect(container.textContent).toContain("Copy diagnostic bundle");
  });

  it("keeps a coarse working card visible when a run is active before stream events arrive", () => {
    const container = document.createElement("div");

    render(
      renderChat(
        createProps({
          sending: false,
          stream: null,
          canAbort: true,
          streamStartedAt: 1000,
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-run-status")).not.toBeNull();
    expect(container.textContent).toContain("Working...");
    expect(container.textContent).toContain("running");
  });

  it("renders the operator experience panel with redacted diagnostics", () => {
    const container = document.createElement("div");

    render(
      renderChat(
        createProps({
          runtimeVersion: "test-runtime",
          runId: "run-diagnostic-1",
          hostOperatorStatus: {
            state: "read_only",
            scopes: ["live_repo", "operator_workspace"],
            auditId: "audit_1",
            reason: "write disabled",
          },
          messages: [
            {
              role: "user",
              content: "RAW PROMPT SHOULD NOT ENTER DIAGNOSTIC BUNDLE",
              timestamp: 900,
            },
            {
              role: "assistant",
              content: [{ type: "text", text: "Memory activity" }],
              timestamp: 1000,
              __openclaw: {
                kind: "model_memory_activity",
                schemaVersion: 1,
                eventType: "projection_digest_used",
                label: "projection digest used",
                status: "completed",
                ids: {
                  retrievalRequestId: ["req_1"],
                  projectionIds: ["proj_1"],
                  selectedMemoryIds: ["mem_1"],
                },
              },
            },
          ],
          toolMessages: [
            {
              role: "tool",
              toolName: "git status",
              content: "bounded status",
              timestamp: 1100,
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".operator-experience-panel")).not.toBeNull();
    expect(container.textContent).toContain("host-operator read-only");
    expect(container.textContent).toContain("1 memory events");

    const toggle = container.querySelector<HTMLButtonElement>(".operator-experience-panel__toggle");
    toggle?.click();
    render(
      renderChat(
        createProps({
          runtimeVersion: "test-runtime",
          runId: "run-diagnostic-1",
          hostOperatorStatus: {
            state: "read_only",
            scopes: ["live_repo", "operator_workspace"],
            auditId: "audit_1",
            reason: "write disabled",
          },
          messages: [
            {
              role: "user",
              content: "RAW PROMPT SHOULD NOT ENTER DIAGNOSTIC BUNDLE",
              timestamp: 900,
            },
            {
              role: "assistant",
              content: [{ type: "text", text: "Memory activity" }],
              timestamp: 1000,
              __openclaw: {
                kind: "model_memory_activity",
                schemaVersion: 1,
                eventType: "projection_digest_used",
                label: "projection digest used",
                status: "completed",
                ids: {
                  retrievalRequestId: ["req_1"],
                  projectionIds: ["proj_1"],
                  selectedMemoryIds: ["mem_1"],
                },
              },
            },
          ],
          toolMessages: [
            {
              role: "tool",
              toolName: "git status",
              content: "bounded status",
              timestamp: 1100,
            },
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Retrieval proof explorer");
    expect(container.textContent).toContain("Projection artifacts");
    expect(container.textContent).toContain("Diff/test/build cards");
    expect(container.textContent).toContain("git status");
    const diagnostic = container
      .querySelector<HTMLButtonElement>(".operator-diagnostic-copy")
      ?.getAttribute("data-diagnostic-bundle");
    expect(diagnostic).toContain("run-diagnostic-1");
    expect(diagnostic).toContain("projection digest used");
    expect(diagnostic).not.toContain("RAW PROMPT SHOULD NOT ENTER DIAGNOSTIC BUNDLE");
  });

  it("renders pending product proactivity as compact chrome instead of a transcript panel", () => {
    const container = document.createElement("div");
    const onOpenWorkQueue = vi.fn();
    render(
      renderChat(
        createProps({
          productProactivityQueue: [
            {
              queueItemId: "queue-item-1",
              candidateId: "candidate-1",
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Review the unresolved gateway rebuild follow-up.",
              planTitle: "Gateway rebuild follow-up",
              problem: "The live gateway may not include the latest proactivity UX changes.",
              proposedMessage:
                "Should we rerun the live gateway rebuild now that the proactivity UX changed?",
              userBenefit:
                "Keeps the visible OpenClaw UI aligned with the current proactivity implementation.",
              evidenceSummary:
                "The active remediation work changed runtime, gateway, and UI proactivity files.",
              confidence: "medium" as const,
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              eligibleScope: {
                environment: "live",
                userId: "conor",
                recipientId: "conor",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "operator-conor",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: ["proof-1"],
                proofPrerequisiteHashes: ["hash-1"],
              },
              sourceRefs: ["source-ref-1"],
              sourceProfileIds: ["curated_repo_doc"],
              authorityTiers: ["curated_authoritative"],
              contentHashes: ["content-hash-1"],
              proofHashes: ["proof-hash-1"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-26T16:00:00.000Z",
              updatedAt: "2026-04-26T16:00:00.000Z",
            },
          ],
          onOpenWorkQueue,
        }),
      ),
      container,
    );

    const entryPoint = container.querySelector<HTMLButtonElement>(
      ".proactivity-entrypoint__button",
    );
    expect(entryPoint).not.toBeNull();
    expect(entryPoint?.textContent).toContain("Work Queue");
    expect(entryPoint?.textContent).toContain("1 actionable");
    expect(container.querySelector(".chat-thread .product-proactivity-panel")).toBeNull();
    entryPoint?.click();
    expect(onOpenWorkQueue).toHaveBeenCalledWith();
  });

  it("does not surface sent-only proactivity as a chat lifecycle panel", () => {
    const baseItem = {
      queueItemId: "queue-item-1",
      candidateId: "candidate-1",
      messageClass: "operator_approved_follow_up_available" as const,
      boundedDisplayText: "A recent Model Memory task has a follow-up ready for review.",
      eligibleScope: {
        environment: "live" as const,
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator-conor",
        allowedMessageClasses: ["operator_approved_follow_up_available"],
        proofPrerequisiteIds: ["proof-1"],
        proofPrerequisiteHashes: ["hash-1"],
      },
      sourceRefs: ["docs/projects/model-memory/phase-2-execution-roadmap.md"],
      sourceProfileIds: ["curated_repo_doc"],
      authorityTiers: ["curated_authoritative"],
      contentHashes: ["content-hash-1"],
      proofHashes: ["proof-hash-1"],
      noDarkDataStatus: "pass" as const,
      staleLabels: [],
      conflictLabels: [],
      blockedReasonCodes: [],
      generatedAt: "2026-04-26T18:00:00.000Z",
      updatedAt: "2026-04-26T18:00:00.000Z",
    };
    const beforeApproval = document.createElement("div");
    render(
      renderChat(
        createProps({
          productProactivityQueue: [{ ...baseItem, status: "pending_review" as const }],
        }),
      ),
      beforeApproval,
    );
    expect(beforeApproval.querySelector(".proactivity-notification")).toBeNull();

    const afterApproval = document.createElement("div");
    const onDismiss = vi.fn();
    render(
      renderChat(
        createProps({
          productProactivityQueue: [{ ...baseItem, status: "sent" as const }],
          onProductProactivityDismiss: onDismiss,
        }),
      ),
      afterApproval,
    );

    expect(afterApproval.querySelector(".proactivity-notification")).toBeNull();
    expect(afterApproval.querySelector(".heartbeat-proactivity-review")).toBeNull();
    expect(afterApproval.textContent).not.toContain("raw-prompt-marker");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders personal auto-send product UX with disable control and manual-only follow-up", () => {
    const container = document.createElement("div");
    const onDisable = vi.fn();
    render(
      renderChat(
        createProps({
          personalAutoSendUx: {
            settingsId: "personal-autosend-settings-1",
            mode: "controlled_autosend_trial",
            personalTrialOptedIn: true,
            userDisabled: false,
            visibleInProductUx: true,
            allowedAutoSendClass: "operator_approved_suggestion_available",
            manualOnlyMessageClasses: ["operator_approved_follow_up_available"],
            controls: [
              "enable_personal_trial",
              "disable_return_to_manual",
              "view_kill_switch_state",
            ],
            killSwitchEnvVars: [
              "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
              "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
            ],
          },
          onPersonalAutoSendDisable: onDisable,
        }),
      ),
      container,
    );

    expect(container.querySelector(".personal-autosend-panel")).not.toBeNull();
    expect(container.textContent).toContain("Personal auto-send");
    expect(container.textContent).toContain("controlled autosend trial");
    expect(container.textContent).toContain("operator_approved_suggestion_available");
    expect(container.textContent).toContain("operator_approved_follow_up_available");
    container.querySelector<HTMLButtonElement>(".personal-autosend-disable")?.click();
    expect(onDisable).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("raw-prompt-marker");
  });

  it("keeps return-to-manual control available in manual-only mode", () => {
    const container = document.createElement("div");
    const onDisable = vi.fn();
    render(
      renderChat(
        createProps({
          personalAutoSendUx: {
            settingsId: "personal-autosend-settings-2",
            mode: "manual_only",
            personalTrialOptedIn: false,
            userDisabled: true,
            visibleInProductUx: true,
            allowedAutoSendClass: "operator_approved_suggestion_available",
            manualOnlyMessageClasses: ["operator_approved_follow_up_available"],
            controls: [
              "enable_personal_trial",
              "disable_return_to_manual",
              "view_kill_switch_state",
            ],
            killSwitchEnvVars: [
              "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
              "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
            ],
          },
          onPersonalAutoSendDisable: onDisable,
        }),
      ),
      container,
    );

    const button = container.querySelector<HTMLButtonElement>(".personal-autosend-disable");
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it("shows contextual proactivity only for exact active session matches", () => {
    const container = document.createElement("div");
    const onOpenWorkQueue = vi.fn();
    const matchingItem = {
      queueItemId: "queue-context-1",
      candidateId: "candidate-context-1",
      messageClass: "operator_approved_suggestion_available" as const,
      boundedDisplayText: "Follow up on the unresolved gateway rebuild issue.",
      candidateSummary: "Gateway rebuild follow-up is still unresolved.",
      planTitle: "Gateway rebuild follow-up",
      problem: "The live gateway may not include the latest proactivity UX changes.",
      suggestedAction: "Approve and send the gateway rebuild follow-up if it still applies.",
      messagePreview: "Should we rerun the live gateway rebuild now that proactivity UX changed?",
      proposedMessage: "Should we rerun the live gateway rebuild now that proactivity UX changed?",
      expectedUserValue: "Keeps the live UI aligned with the latest deployed proactivity surface.",
      userBenefit: "Keeps the live UI aligned with the latest deployed proactivity surface.",
      evidenceSummary:
        "The active session is working on proactivity UX remediation and gateway rebuild evidence.",
      confidence: "medium" as const,
      blockedIfMissing: [],
      status: "pending_review" as const,
      layer: "actionable" as const,
      eligibleScope: {
        environment: "live" as const,
        userId: "conorlynch",
        recipientId: "conorlynch",
        projectId: "openclaw-platform",
        sessionKey: "main",
        operatorId: "operator-conorlynch",
        allowedMessageClasses: ["operator_approved_suggestion_available"],
        proofPrerequisiteIds: ["proof-1"],
        proofPrerequisiteHashes: ["hash-1"],
      },
      sourceRefs: ["docs/projects/model-memory/phase-2-execution-roadmap.md"],
      sourceProfileIds: ["curated_repo_doc"],
      authorityTiers: ["curated_authoritative"],
      contentHashes: ["content-hash-1"],
      proofHashes: ["proof-hash-1"],
      noDarkDataStatus: "pass" as const,
      staleLabels: [],
      conflictLabels: [],
      blockedReasonCodes: [],
      generatedAt: "2026-04-26T22:00:00.000Z",
      updatedAt: "2026-04-26T22:00:00.000Z",
    };

    render(
      renderChat(
        createProps({
          sessionKey: "main",
          activeProactivityContext: {
            userId: "conorlynch",
            recipientId: "conorlynch",
            projectId: "openclaw-platform",
            sessionKey: "main",
            operatorId: "operator-conorlynch",
            source: "chat_active_session",
          },
          productProactivityQueue: [
            matchingItem,
            {
              ...matchingItem,
              queueItemId: "queue-context-2",
              candidateId: "candidate-context-2",
              eligibleScope: { ...matchingItem.eligibleScope, sessionKey: "other" },
              messagePreview: "This non-matching session item should stay in the inbox.",
            },
          ],
          onOpenWorkQueue,
        }),
      ),
      container,
    );

    const summary = container.querySelector(".heartbeat-proactivity-review");
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("Gateway Rebuild Follow-Up");
    expect(summary?.textContent).not.toContain("This non-matching session item");
    summary?.querySelector<HTMLButtonElement>(".btn--primary")?.click();
    expect(onOpenWorkQueue).toHaveBeenCalledWith("queue-context-1");

    render(
      renderChat(
        createProps({
          sessionKey: "other",
          activeProactivityContext: {
            userId: "conorlynch",
            recipientId: "conorlynch",
            projectId: "openclaw-platform",
            sessionKey: "other",
            operatorId: "operator-conorlynch",
            source: "chat_active_session",
          },
          productProactivityQueue: [
            {
              ...matchingItem,
              staleLabels: ["stale"],
              eligibleScope: { ...matchingItem.eligibleScope, sessionKey: "other" },
            },
          ],
        }),
      ),
      container,
    );
    expect(container.querySelector(".contextual-proactivity-card")).toBeNull();
  });

  it("renders inline follow-ups from the assistant answer without opening the inbox", () => {
    const container = document.createElement("div");
    const onWorkAction = vi.fn();
    render(
      renderChat(
        createProps({
          sessionKey: "main",
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Plan the runtime seam reset and investigate the live heartbeat path.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_inline_followup",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-27T16:00:15.000Z"),
            },
          ],
          productProactivityQueue: [
            {
              queueItemId: "queue-inline-1",
              candidateId: "candidate-inline-1",
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Plan the runtime seam reset.",
              candidateSummary: "The latest assistant answer identified a concrete next step.",
              planTitle: "Plan runtime seam reset",
              problem: "Assistant output identified a real same-session follow-up opportunity.",
              suggestedAction: "Start a bounded planning handoff for the runtime seam reset.",
              messagePreview: "Plan a bounded next step for the runtime seam reset.",
              proposedMessage: "Plan a bounded next step for the runtime seam reset.",
              expectedUserValue:
                "Turns a concrete assistant answer into immediate next-step momentum.",
              userBenefit: "Turns a concrete assistant answer into immediate next-step momentum.",
              evidenceSummary: "Derived from the immediately preceding assistant final answer.",
              confidence: "medium",
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              workItemKind: "planning_request",
              primaryAction: {
                actionType: "plan_this",
                label: "Plan this",
                description: "Start a bounded planning handoff in chat.",
                requiresChatInject: false,
                executesAction: false,
              },
              eligibleScope: {
                environment: "live",
                userId: "conorlynch",
                recipientId: "conorlynch",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "operator-conorlynch",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: [],
                proofPrerequisiteHashes: [],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_inline_followup"],
              sourceProfileIds: ["tool_result_capture"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-inline-1"],
              proofHashes: ["proof-hash-inline-1"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-27T16:00:16.000Z",
              updatedAt: "2026-04-27T16:00:16.000Z",
            },
          ],
          onProductProactivityWorkAction: onWorkAction,
        }),
      ),
      container,
    );

    const card = container.querySelector(".inline-proactivity-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Follow-ups from this answer");
    expect(card?.textContent).toContain("Plan Runtime Seam Reset");
    expect(card?.textContent).toContain("Plan this");
    Array.from(card?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("Plan this"))
      ?.click();
    expect(onWorkAction).toHaveBeenCalledWith("queue-inline-1", "plan_this");
  });

  it("preserves the same skill candidate id across inline, heartbeat, and inbox surfaces", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "main",
          sidebarContent: { kind: "proactivityInbox" },
          sidebarOpen: true,
          onCloseSidebar: () => undefined,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_skill_candidate_surface",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-28T09:00:15.000Z"),
            },
          ],
          productProactivityQueue: [
            {
              queueItemId: "queue-skill-1",
              candidateId: "candidate-skill-1",
              opportunityClass: "skill_candidate",
              skillCandidate: {
                skillCandidateId: "skill-candidate-1",
                proactivityOpportunityId: "opportunity-skill-1",
                normalizedIntentKey: "skill candidate ledger integration",
                sourceRuntime: "openclaw_session",
                candidateType: "repeated_work_pattern",
                evidenceSummary: "Observed repeated bounded assistant opportunities.",
                recurrenceCount: 3,
                recurrenceWindow: {
                  firstSeenAt: "2026-04-28T09:00:00.000Z",
                  lastSeenAt: "2026-04-28T09:02:00.000Z",
                },
                exampleHashes: ["hash-a", "hash-b"],
                suggestedSkillName: "skill-candidate-ledger-integration",
                riskTier: "low",
                autonomyLevelCeiling: 1,
                lifecycleStatus: "detected",
                installTargets: ["workspace_skills_dir"],
                evalStatus: "not_started",
                vettingStatus: "not_started",
                canaryStatus: "not_started",
                createdAt: "2026-04-28T09:00:00.000Z",
                updatedAt: "2026-04-28T09:02:00.000Z",
                provenanceRefs: ["chat://main/assistant_turn/msg_skill_candidate_surface"],
                rollbackPlan: {
                  rollbackId: "rollback-skill-1",
                  strategy: "disable_candidate_only",
                  targetPaths: ["workspace_skills_dir"],
                  directMainMutationAllowed: false,
                },
              },
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Turn skill candidate ledger integration into a reusable skill",
              candidateSummary: "A repeated workflow now looks reusable.",
              planTitle: "Turn skill candidate ledger integration into a reusable skill",
              problem: "The same bounded workflow surfaced repeatedly in recent work.",
              suggestedAction: "Plan the smallest safe reusable-skill slice.",
              messagePreview:
                "Plan a bounded skill candidate ledger skill: define the workflow and success checks.",
              proposedMessage:
                "Plan a bounded skill candidate ledger skill: define the workflow and success checks.",
              expectedUserValue:
                "Converts repeated work into a reusable skill instead of re-solving it each session.",
              userBenefit:
                "Converts repeated work into a reusable skill instead of re-solving it each session.",
              evidenceSummary: "Supported by repeated same-session assistant opportunities.",
              confidence: "high",
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              workItemKind: "planning_request",
              primaryAction: {
                actionType: "plan_this",
                label: "Plan this",
                description: "Start a bounded planning handoff in chat.",
                requiresChatInject: false,
                executesAction: false,
              },
              eligibleScope: {
                environment: "live",
                userId: "conorlynch",
                recipientId: "conorlynch",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "operator-conorlynch",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: [],
                proofPrerequisiteHashes: [],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_skill_candidate_surface"],
              sourceProfileIds: ["manual_note"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-skill-1"],
              proofHashes: ["proof-hash-skill-1"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-28T09:02:10.000Z",
              updatedAt: "2026-04-28T09:02:10.000Z",
            },
          ],
          proactivityInboxDigest: {
            digestId: "digest-skill-1",
            generatedAt: "2026-04-28T09:02:10.000Z",
            filters: [
              "actionable",
              "pending",
              "planned",
              "sent",
              "snoozed",
              "dismissed",
              "blocked",
              "autosend_trial",
              "diagnostics",
            ],
            counts: {
              actionable: 1,
              pending: 1,
              planned: 0,
              sent: 0,
              snoozed: 0,
              dismissed: 0,
              blocked: 0,
              autosend_trial: 0,
              diagnostics: 0,
            },
            layerCounts: {
              actionable: 1,
              history: 0,
              diagnostic: 0,
            },
            items: [
              {
                itemId: "inbox-skill-1",
                sourceArtifactReportId: "report-skill-1",
                candidateId: "candidate-skill-1",
                skillCandidate: {
                  skillCandidateId: "skill-candidate-1",
                  proactivityOpportunityId: "opportunity-skill-1",
                  normalizedIntentKey: "skill candidate ledger integration",
                  sourceRuntime: "openclaw_session",
                  candidateType: "repeated_work_pattern",
                  evidenceSummary: "Observed repeated bounded assistant opportunities.",
                  recurrenceCount: 3,
                  recurrenceWindow: {
                    firstSeenAt: "2026-04-28T09:00:00.000Z",
                    lastSeenAt: "2026-04-28T09:02:00.000Z",
                  },
                  exampleHashes: ["hash-a", "hash-b"],
                  suggestedSkillName: "skill-candidate-ledger-integration",
                  riskTier: "low",
                  autonomyLevelCeiling: 1,
                  lifecycleStatus: "detected",
                  installTargets: ["workspace_skills_dir"],
                  evalStatus: "not_started",
                  vettingStatus: "not_started",
                  canaryStatus: "not_started",
                  createdAt: "2026-04-28T09:00:00.000Z",
                  updatedAt: "2026-04-28T09:02:00.000Z",
                  provenanceRefs: ["chat://main/assistant_turn/msg_skill_candidate_surface"],
                  rollbackPlan: {
                    rollbackId: "rollback-skill-1",
                    strategy: "disable_candidate_only",
                    targetPaths: ["workspace_skills_dir"],
                    directMainMutationAllowed: false,
                  },
                },
                opportunityId: "opportunity-skill-1",
                opportunityClass: "skill_candidate",
                opportunityStatus: "open",
                queueItemId: "queue-skill-1",
                workItemId: "work-item-skill-1",
                workItemKind: "planning_request",
                workItemStatus: "not_started",
                primaryAction: {
                  actionType: "plan_this",
                  label: "Plan this",
                  description: "Start a bounded planning handoff in chat.",
                  requiresChatInject: false,
                  executesAction: false,
                },
                secondaryActions: [],
                ctaExplanation: "Starts bounded planning for a reusable skill candidate.",
                handoffStatus: "idle",
                handoffError: null,
                handoffMessageAnchor: null,
                messageClass: "operator_approved_suggestion_available",
                boundedDisplayText: "Turn skill candidate ledger integration into a reusable skill",
                candidateSummary: "A repeated workflow now looks reusable.",
                suggestedAction: "Plan the smallest safe reusable-skill slice.",
                messagePreview:
                  "Plan a bounded skill candidate ledger skill: define the workflow and success checks.",
                planTitle: "Turn skill candidate ledger integration into a reusable skill",
                problem: "The same bounded workflow surfaced repeatedly in recent work.",
                proposedMessage:
                  "Plan a bounded skill candidate ledger skill: define the workflow and success checks.",
                expectedUserValue:
                  "Converts repeated work into a reusable skill instead of re-solving it each session.",
                userBenefit:
                  "Converts repeated work into a reusable skill instead of re-solving it each session.",
                evidenceSummary: "Supported by repeated same-session assistant opportunities.",
                confidence: "high",
                blockedIfMissing: [],
                status: "pending_review",
                filterTags: ["actionable", "pending"],
                layer: "actionable",
                attentionRequired: true,
                sendStatus: "idle",
                sendError: null,
                sentMessageAnchor: null,
                sourceRefs: ["chat://main/assistant_turn/msg_skill_candidate_surface"],
                sourceProfileIds: ["manual_note"],
                authorityTiers: ["tool_grounded"],
                contentHashes: ["content-hash-skill-1"],
                proofHashes: ["proof-hash-skill-1"],
                noDarkDataStatus: "pass",
                feedbackSummary: {
                  positiveFeedbackCount: 0,
                  negativeFeedbackCount: 0,
                  tooRepetitiveCount: 0,
                  wrongContextCount: 0,
                  unsafePrivateCount: 0,
                },
                whyThisAppearedSummary:
                  "Generated from the canonical Model Memory opportunity ledger with source refs, authority tiers, source profiles, and proof hashes preserved.",
                blockedReasonCodes: [],
              },
            ],
          },
        }),
      ),
      container,
    );

    expect(
      container.querySelector(
        '[data-skill-candidate-id="skill-candidate-1"].inline-proactivity-card__item',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.heartbeat-proactivity-review [data-skill-candidate-id="skill-candidate-1"]',
      ),
    ).not.toBeNull();
    expect(container.querySelector(".proactivity-entrypoint__button")?.textContent).toContain(
      "Work Queue",
    );
  });

  it("prefers a draft-ready skill candidate over sibling reverse prompts on the same assistant source", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "main",
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Turn the recurring workflow into a reusable skill draft.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_skill_priority",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-28T16:22:00.000Z"),
            },
          ],
          productProactivityQueue: [
            {
              queueItemId: "queue-draft-priority",
              candidateId: "candidate-draft-priority",
              workItemId: "work-item-draft-priority",
              opportunityId: "opportunity-draft-priority",
              opportunityClass: "standard",
              opportunityStatus: "open",
              workItemKind: "draft_next_steps",
              workItemStatus: "drafted",
              primaryAction: {
                actionType: "draft_next_steps",
                label: "Draft next steps",
                description: "Prepare a bounded next-step draft in chat.",
                requiresChatInject: false,
                executesAction: false,
              },
              secondaryActions: [],
              ctaExplanation:
                "A same-source draft exists, but the canonical skill candidate should still be preferred.",
              handoffStatus: "idle",
              handoffError: null,
              handoffMessageAnchor: null,
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Draft the follow-up brief for the same workflow.",
              candidateSummary: "Draft the follow-up brief for the same workflow.",
              suggestedAction: "Prepare a short bounded follow-up brief.",
              messagePreview: "Prepare a short bounded follow-up brief.",
              planTitle: "Draft the follow-up brief",
              problem: "A non-canonical draft shares the same assistant source.",
              proposedMessage: "Prepare a short bounded follow-up brief.",
              expectedUserValue:
                "Keeps a useful sibling draft available without displacing the skill candidate.",
              userBenefit:
                "Keeps a useful sibling draft available without displacing the skill candidate.",
              evidenceSummary: "Sibling draft from the same assistant source.",
              confidence: "high",
              blockedIfMissing: [],
              draftReady: true,
              autonomousDraft: {
                draftId: "autonomous-draft-followup",
                draftKind: "planning_brief",
                recommendedApproach: "Prepare a short bounded follow-up brief.",
                nextSafeStep: "Review this only if the skill draft needs extra context.",
                uncertainty:
                  "The follow-up brief may be redundant once the skill draft is reviewed.",
                safetyBoundary:
                  "This is an internal bounded draft only. Do not edit files, execute actions, or send outbound messages without explicit approval.",
              },
              resolvedByChatMessageId: null,
              supersededByOpportunityId: null,
              status: "pending_review",
              layer: "actionable",
              attentionRequired: true,
              sendStatus: "idle",
              sendError: null,
              sentMessageAnchor: null,
              eligibleScope: {
                environment: "live",
                userId: "local-openclaw-user",
                recipientId: "local-openclaw-recipient",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "local-openclaw-operator",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: ["live-generation-gate"],
                proofPrerequisiteHashes: ["proof-hash-draft-priority"],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_skill_priority"],
              sourceProfileIds: ["manual_note"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-draft-priority"],
              proofHashes: ["proof-hash-draft-priority"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-28T16:22:03.000Z",
              updatedAt: "2026-04-28T16:22:50.000Z",
            },
            {
              queueItemId: "queue-skill-priority",
              candidateId: "candidate-skill-priority",
              skillCandidate: {
                skillCandidateId: "skill-candidate-priority",
                proactivityOpportunityId: "opportunity-skill-priority",
                normalizedIntentKey: "memory observability reporting skill",
                sourceRuntime: "openclaw_session",
                candidateType: "repeated_work_pattern",
                evidenceSummary: "Repeated same-session workflow plus a generated draft package.",
                recurrenceCount: 3,
                recurrenceWindow: {
                  firstSeenAt: "2026-04-28T16:22:00.000Z",
                  lastSeenAt: "2026-04-28T16:22:30.000Z",
                },
                exampleHashes: ["example-hash-skill-priority"],
                suggestedSkillName: "memory-observability-reporting-skill",
                riskTier: "low",
                autonomyLevelCeiling: 1,
                lifecycleStatus: "detected",
                installTargets: ["workspace_skills_dir"],
                evalStatus: "not_started",
                vettingStatus: "not_started",
                canaryStatus: "not_started",
                createdAt: "2026-04-28T16:22:05.000Z",
                updatedAt: "2026-04-28T16:22:30.000Z",
                provenanceRefs: ["chat://main/assistant_turn/msg_skill_priority"],
                rollbackPlan: {
                  rollbackId: "rollback-skill-priority",
                  strategy: "disable_candidate_only",
                  targetPaths: ["workspace_skills_dir"],
                  directMainMutationAllowed: false,
                },
              },
              workItemId: "work-item-skill-priority",
              opportunityId: "opportunity-skill-priority",
              opportunityClass: "skill_candidate",
              opportunityStatus: "draft_ready",
              workItemKind: "planning_request",
              workItemStatus: "drafted",
              primaryAction: {
                actionType: "plan_this",
                label: "Plan this",
                description: "Start a bounded planning handoff in chat.",
                requiresChatInject: false,
                executesAction: false,
              },
              secondaryActions: [],
              ctaExplanation: "Review the bounded draft before any later eval or install work.",
              handoffStatus: "idle",
              handoffError: null,
              handoffMessageAnchor: null,
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Draft the recurring workflow skill.",
              candidateSummary: "Draft the recurring workflow skill.",
              suggestedAction: "Review the review-only skill package and plan next eval work.",
              messagePreview: "Review the review-only skill package and plan next eval work.",
              planTitle: "Draft the recurring workflow skill",
              problem: "This same workflow keeps recurring in the live repo work.",
              proposedMessage: "Review the review-only skill package and plan next eval work.",
              expectedUserValue:
                "Keeps the canonical skill candidate in view even when sibling prompts are generated.",
              userBenefit:
                "Keeps the canonical skill candidate in view even when sibling prompts are generated.",
              evidenceSummary: "Repeated same-session workflow plus a generated draft package.",
              confidence: "high",
              blockedIfMissing: [],
              draftReady: true,
              skillifierDraft: {
                skillPackageId: "skill-package-priority",
                skillifierReportId: "skillifier-report-priority",
                decision: "draft_ready",
                packageTitle: "Recurring Workflow Skill Draft",
                draftPath:
                  "/home/node/.openclaw/workspace/skills/recurring-workflow--draft-priority",
                reviewSummary:
                  "A review-only draft package is ready in the allowed workspace root.",
                nextReviewStep: "Review the SKILL.md contract and define the Milestone 4 evals.",
              },
              resolvedByChatMessageId: null,
              supersededByOpportunityId: null,
              status: "pending_review",
              layer: "actionable",
              attentionRequired: true,
              sendStatus: "idle",
              sendError: null,
              sentMessageAnchor: null,
              eligibleScope: {
                environment: "live",
                userId: "local-openclaw-user",
                recipientId: "local-openclaw-recipient",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "local-openclaw-operator",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: ["live-generation-gate"],
                proofPrerequisiteHashes: ["proof-hash-skill-priority"],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_skill_priority"],
              sourceProfileIds: ["manual_note"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-skill-priority"],
              proofHashes: ["proof-hash-skill-priority"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-28T16:22:05.000Z",
              updatedAt: "2026-04-28T16:22:30.000Z",
            },
            {
              queueItemId: "queue-reverse-priority",
              candidateId: "candidate-reverse-priority",
              workItemId: "work-item-reverse-priority",
              opportunityId: "opportunity-reverse-priority",
              opportunityClass: "reverse_prompt",
              opportunityStatus: "open",
              workItemKind: "draft_next_steps",
              workItemStatus: "drafted",
              primaryAction: {
                actionType: "open_in_current_chat",
                label: "Open in current chat",
                description: "Uses the current chat to continue with the prompt.",
                requiresChatInject: false,
                executesAction: false,
              },
              secondaryActions: [],
              ctaExplanation:
                "A useful sibling prompt exists, but it should not displace the canonical skill candidate.",
              handoffStatus: "idle",
              handoffError: null,
              handoffMessageAnchor: null,
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Question worth asking before the skill draft.",
              candidateSummary: "Question worth asking before the skill draft.",
              suggestedAction: "Ask the adjacent question if the draft needs refinement.",
              messagePreview: "Ask the adjacent question if the draft needs refinement.",
              planTitle: "Question worth asking before the skill draft",
              problem: "A sibling reverse prompt was generated from the same assistant source.",
              proposedMessage: "Ask the adjacent question if the draft needs refinement.",
              expectedUserValue: "Provides a secondary path if the draft needs more context.",
              userBenefit: "Provides a secondary path if the draft needs more context.",
              evidenceSummary: "Sibling prompt from the same live assistant source.",
              confidence: "medium",
              blockedIfMissing: [],
              draftReady: true,
              autonomousDraft: {
                draftId: "autonomous-draft-priority",
                draftKind: "planning_brief",
                recommendedApproach: "Turn the sibling prompt into a short bounded plan.",
                nextSafeStep: "Review the prompt only if the canonical draft is insufficient.",
                uncertainty: "The sibling prompt may already be covered by the skill draft.",
                safetyBoundary:
                  "This is an internal bounded draft only. Do not edit files, execute actions, or send outbound messages without explicit approval.",
              },
              resolvedByChatMessageId: null,
              supersededByOpportunityId: null,
              status: "pending_review",
              layer: "actionable",
              attentionRequired: true,
              sendStatus: "idle",
              sendError: null,
              sentMessageAnchor: null,
              eligibleScope: {
                environment: "live",
                userId: "local-openclaw-user",
                recipientId: "local-openclaw-recipient",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "local-openclaw-operator",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: ["live-generation-gate"],
                proofPrerequisiteHashes: ["proof-hash-reverse-priority"],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_skill_priority"],
              sourceProfileIds: ["manual_note"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-reverse-priority"],
              proofHashes: ["proof-hash-reverse-priority"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-28T16:22:06.000Z",
              updatedAt: "2026-04-28T16:22:45.000Z",
            },
          ],
        }),
      ),
      container,
    );

    expect(
      container.querySelector(
        '[data-skill-candidate-id="skill-candidate-priority"].inline-proactivity-card__item',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.heartbeat-proactivity-review [data-skill-candidate-id="skill-candidate-priority"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("Recurring Workflow Skill Draft");
  });

  it("cleans polluted copy and collapses same-session duplicate inline follow-ups", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "main",
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Plan the heartbeat proactivity review cleanup.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_inline_cleanup",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-27T20:15:15.000Z"),
            },
          ],
          productProactivityQueue: [
            {
              queueItemId: "queue-inline-older",
              candidateId: "candidate-inline-older",
              workItemId: "work-inline-older",
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Plan the heartbeat proactivity review item only.",
              candidateSummary: "Older same-session variant.",
              planTitle: "Plan the **heartbeat proactivity review** item only",
              problem:
                "System: [2026-04-27 20:15 UTC] [Post-compaction context refresh] The current item still leaks system text. Source: chat://main/assistant_turn/msg_inline_cleanup.",
              suggestedAction: "Plan the cleanup.",
              messagePreview:
                "Plan the **heartbeat proactivity review** item only, with no code changes yet.",
              proposedMessage:
                "Plan the **heartbeat proactivity review** item only, with no code changes yet.",
              expectedUserValue:
                "Expected value: keep same-session work readable. Source: chat://main/assistant_turn/msg_inline_cleanup.",
              userBenefit: "Expected value: keep same-session work readable.",
              evidenceSummary:
                'Sender (untrusted metadata): {"label":"openclaw-control-ui","id":"openclaw-control-ui"}',
              confidence: "medium",
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              workItemKind: "planning_request",
              primaryAction: {
                actionType: "plan_this",
                label: "Plan this",
                description: "Start a bounded planning handoff in chat.",
                requiresChatInject: false,
                executesAction: false,
              },
              eligibleScope: {
                environment: "live",
                userId: "conorlynch",
                recipientId: "conorlynch",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "operator-conorlynch",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: [],
                proofPrerequisiteHashes: [],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_inline_cleanup"],
              sourceProfileIds: ["tool_result_capture"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-inline-older"],
              proofHashes: ["proof-hash-inline-older"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-27T20:15:16.000Z",
              updatedAt: "2026-04-27T20:15:16.000Z",
            },
            {
              queueItemId: "queue-inline-newer",
              candidateId: "candidate-inline-newer",
              workItemId: "work-inline-newer",
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Heartbeat proactivity review cleanup.",
              candidateSummary: "Newest same-session canonical variant.",
              planTitle: "Heartbeat proactivity review cleanup",
              problem: "The current follow-up still leaks system text into user-facing copy.",
              suggestedAction: "Plan the cleanup.",
              messagePreview:
                "Plan the cleanup so heartbeat and inline cards show only clean user-facing text.",
              proposedMessage:
                "Plan the cleanup so heartbeat and inline cards show only clean user-facing text.",
              expectedUserValue: "Makes surfaced proactivity readable and ambient again.",
              userBenefit: "Makes surfaced proactivity readable and ambient again.",
              evidenceSummary: "Derived from the visible assistant final answer.",
              confidence: "high",
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              workItemKind: "planning_request",
              primaryAction: {
                actionType: "plan_this",
                label: "Plan this",
                description: "Start a bounded planning handoff in chat.",
                requiresChatInject: false,
                executesAction: false,
              },
              eligibleScope: {
                environment: "live",
                userId: "conorlynch",
                recipientId: "conorlynch",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "operator-conorlynch",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: [],
                proofPrerequisiteHashes: [],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_inline_cleanup"],
              sourceProfileIds: ["tool_result_capture"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-inline-newer"],
              proofHashes: ["proof-hash-inline-newer"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-27T20:16:16.000Z",
              updatedAt: "2026-04-27T20:16:16.000Z",
            },
          ],
        }),
      ),
      container,
    );

    const card = container.querySelector(".inline-proactivity-card");
    expect(card?.querySelectorAll(".inline-proactivity-card__item")).toHaveLength(1);
    expect(card?.textContent).toContain("Heartbeat Proactivity Review Cleanup");
    expect(card?.textContent).not.toContain("Read HEARTBEAT.md");
    expect(card?.textContent).not.toContain("Post-compaction context refresh");
    expect(card?.textContent).not.toContain("Sender (untrusted metadata)");
    expect(card?.textContent).not.toContain("Source: chat://");
  });

  it("prioritizes visible assistant-derived opportunities in contextual and heartbeat surfaces", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "main",
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Implement the assistant-final capture filter and verify the heartbeat path.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_recent_followup",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-27T18:05:00.000Z"),
            },
          ],
          activeProactivityContext: {
            userId: "conorlynch",
            recipientId: "conorlynch",
            projectId: "openclaw-platform",
            sessionKey: "main",
            operatorId: "operator-conorlynch",
            source: "chat_active_session",
          },
          productProactivityQueue: [
            {
              queueItemId: "queue-older-contextual",
              candidateId: "candidate-older-contextual",
              workItemId: "work-item-older-contextual",
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Planner candidate-plan generation",
              candidateSummary:
                "An older contextual item should not displace the visible answer follow-up.",
              planTitle: "Planner candidate-plan generation",
              problem: "Older contextual planner work is still open.",
              suggestedAction: "Review the planner item if nothing more current exists.",
              messagePreview: "Review the older planner item.",
              proposedMessage: "Review the older planner item.",
              expectedUserValue: "Keeps background planner work visible.",
              userBenefit: "Keeps background planner work visible.",
              evidenceSummary: "Older contextual item.",
              confidence: "medium",
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              workItemKind: "planning_request",
              eligibleScope: {
                environment: "live",
                userId: "conorlynch",
                recipientId: "conorlynch",
                projectId: "openclaw-platform",
                sessionKey: "main",
                operatorId: "operator-conorlynch",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: [],
                proofPrerequisiteHashes: [],
              },
              sourceRefs: ["docs/projects/model-memory/specs/proactive-memory-planner.md"],
              sourceProfileIds: ["curated_repo_doc"],
              authorityTiers: ["curated_authoritative"],
              contentHashes: ["content-hash-older"],
              proofHashes: ["proof-hash-older"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-27T17:00:00.000Z",
              updatedAt: "2026-04-27T17:00:00.000Z",
            },
            {
              queueItemId: "queue-recent-answer",
              candidateId: "candidate-recent-answer",
              workItemId: "work-item-recent-answer",
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Implement assistant-final capture filter",
              candidateSummary: "The visible assistant answer created a current-session follow-up.",
              planTitle: "Implement assistant-final capture filter",
              problem: "The latest assistant answer identified a concrete same-session next step.",
              suggestedAction: "Plan the assistant-final capture filter change now.",
              messagePreview: "Plan the assistant-final capture filter change now.",
              proposedMessage: "Plan the assistant-final capture filter change now.",
              expectedUserValue: "Turns the visible answer into immediate workflow momentum.",
              userBenefit: "Turns the visible answer into immediate workflow momentum.",
              evidenceSummary: "Derived from the visible assistant final answer.",
              confidence: "high",
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              workItemKind: "planning_request",
              eligibleScope: {
                environment: "live",
                userId: "conorlynch",
                recipientId: "conorlynch",
                projectId: "openclaw-platform",
                sessionKey: "main",
                operatorId: "operator-conorlynch",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: [],
                proofPrerequisiteHashes: [],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_recent_followup"],
              sourceProfileIds: ["tool_result_capture"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-recent"],
              proofHashes: ["proof-hash-recent"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-27T18:05:00.000Z",
              updatedAt: "2026-04-27T18:05:00.000Z",
            },
          ],
        }),
      ),
      container,
    );

    const contextualCard = container.querySelector(".inline-proactivity-card");
    expect(contextualCard).not.toBeNull();
    expect(contextualCard?.textContent).toContain("Implement Assistant-Final Capture Filter");
    expect(contextualCard?.textContent).not.toContain("Planner candidate-plan generation");

    const heartbeatCards = Array.from(
      container.querySelectorAll<HTMLElement>(".heartbeat-proactivity-review [data-work-item-id]"),
    );
    expect(heartbeatCards).toHaveLength(2);
    expect(heartbeatCards[0]?.getAttribute("data-work-item-id")).toBe("work-item-recent-answer");
    expect(
      heartbeatCards.some(
        (card) => card.getAttribute("data-work-item-id") === "work-item-older-contextual",
      ),
    ).toBe(true);
  });

  it("keeps inline follow-ups attached to the latest assistant answer that still has actionable items", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "main",
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Implement the assistant-final capture filter and verify the heartbeat path.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_recent_followup",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-27T18:05:00.000Z"),
            },
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "HEARTBEAT_OK",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_heartbeat_ok",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-27T18:06:00.000Z"),
            },
          ],
          productProactivityQueue: [
            {
              queueItemId: "queue-recent-answer",
              candidateId: "candidate-recent-answer",
              workItemId: "work-item-recent-answer",
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "Implement assistant-final capture filter",
              candidateSummary: "The visible assistant answer created a current-session follow-up.",
              planTitle: "Implement assistant-final capture filter",
              problem: "The latest assistant answer identified a concrete same-session next step.",
              suggestedAction: "Plan the assistant-final capture filter change now.",
              messagePreview: "Plan the assistant-final capture filter change now.",
              proposedMessage: "Plan the assistant-final capture filter change now.",
              expectedUserValue: "Turns the visible answer into immediate workflow momentum.",
              userBenefit: "Turns the visible answer into immediate workflow momentum.",
              evidenceSummary: "Derived from the visible assistant final answer.",
              confidence: "high",
              blockedIfMissing: [],
              status: "pending_review",
              layer: "actionable",
              workItemKind: "planning_request",
              primaryAction: {
                actionType: "plan_this",
                label: "Plan this",
                description: "Start a bounded planning handoff in chat.",
                requiresChatInject: false,
                executesAction: false,
              },
              eligibleScope: {
                environment: "live",
                userId: "conorlynch",
                recipientId: "conorlynch",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "operator-conorlynch",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: [],
                proofPrerequisiteHashes: [],
              },
              sourceRefs: ["chat://main/assistant_turn/msg_recent_followup"],
              sourceProfileIds: ["tool_result_capture"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-recent"],
              proofHashes: ["proof-hash-recent"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [],
              generatedAt: "2026-04-27T18:05:00.000Z",
              updatedAt: "2026-04-27T18:05:00.000Z",
            },
          ],
        }),
      ),
      container,
    );

    const card = container.querySelector(".inline-proactivity-card");
    expect(card?.textContent).toContain("Implement Assistant-Final Capture Filter");
    expect(card?.textContent).not.toContain("HEARTBEAT_OK");
  });

  it("adds proactivity to the visible heartbeat review surface with an inbox path", () => {
    const container = document.createElement("div");
    const onOpenWorkQueue = vi.fn();
    const props = createProps({
      sessionKey: "daily-review-proactivity-test",
      onOpenWorkQueue,
      productProactivityQueue: [
        {
          queueItemId: "queue-review-1",
          candidateId: "candidate-review-1",
          messageClass: "operator_approved_suggestion_available",
          boundedDisplayText: "Review the daily operator proactivity item.",
          candidateSummary: "Daily review should include this must-surface item.",
          planTitle: "Daily review proactivity follow-up",
          problem:
            "The operator daily loop needs to surface the active proactivity remediation item.",
          suggestedAction: "Open the inbox detail and approve the message if still useful.",
          messagePreview: "Should we review the proactivity remediation follow-up today?",
          proposedMessage: "Should we review the proactivity remediation follow-up today?",
          expectedUserValue: "Keeps the normal operator loop aware of proactive work.",
          userBenefit: "Keeps the normal operator loop aware of proactive work.",
          evidenceSummary: "The active session has a matching daily-review proactivity candidate.",
          confidence: "medium" as const,
          blockedIfMissing: [],
          status: "pending_review",
          layer: "actionable",
          eligibleScope: {
            environment: "live",
            userId: "conorlynch",
            recipientId: "conorlynch",
            projectId: "openclaw-platform",
            sessionKey: "daily-review-proactivity-test",
            operatorId: "operator-conorlynch",
            allowedMessageClasses: ["operator_approved_suggestion_available"],
            proofPrerequisiteIds: ["proof-1"],
            proofPrerequisiteHashes: ["hash-1"],
          },
          sourceRefs: [
            "docs/projects/model-memory/specs/planner-review-artifacts-and-surfacing.md",
          ],
          sourceProfileIds: ["curated_repo_doc"],
          authorityTiers: ["curated_authoritative"],
          contentHashes: ["content-hash-1"],
          proofHashes: ["proof-hash-1"],
          noDarkDataStatus: "pass",
          staleLabels: [],
          conflictLabels: [],
          blockedReasonCodes: [],
          generatedAt: "2026-04-26T22:00:00.000Z",
          updatedAt: "2026-04-26T22:00:00.000Z",
        },
      ],
      activeProactivityContext: {
        userId: "conorlynch",
        recipientId: "conorlynch",
        projectId: "openclaw-platform",
        sessionKey: "daily-review-proactivity-test",
        operatorId: "operator-conorlynch",
        source: "chat_active_session",
      },
    });
    render(renderChat(props), container);

    const review = container.querySelector(".heartbeat-proactivity-review");
    expect(review).not.toBeNull();
    expect(review?.textContent).toContain("What would help this user today?");
    expect(review?.textContent).toContain("Daily Review Proactivity Follow-Up");
    Array.from(review?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("Review in Work Queue"))
      ?.click();
    expect(onOpenWorkQueue).toHaveBeenCalledWith("queue-review-1");
    Array.from(review?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("Open Work Queue"))
      ?.click();
    expect(onOpenWorkQueue).toHaveBeenCalledWith();
  });

  it("renders heartbeat actions from the same actionable inbox source of truth", () => {
    const container = document.createElement("div");
    const onOpenWorkQueue = vi.fn();
    render(
      renderChat(
        createProps({
          productProactivityQueue: [],
          onOpenWorkQueue,
          proactivityInboxDigest: {
            digestId: "digest-heartbeat-source",
            generatedAt: "2026-04-27T06:00:00.000Z",
            filters: ["actionable", "pending", "diagnostics"],
            counts: {
              actionable: 2,
              pending: 2,
              planned: 0,
              sent: 0,
              snoozed: 0,
              dismissed: 0,
              blocked: 0,
              autosend_trial: 0,
              diagnostics: 1,
            },
            layerCounts: { actionable: 2, history: 0, diagnostic: 1 },
            items: [
              {
                itemId: "inbox-heartbeat-item",
                sourceArtifactReportId: "report-heartbeat-source",
                candidateId: "candidate-heartbeat-source",
                queueItemId: "queue-heartbeat-source",
                workItemKind: "planning_request",
                primaryAction: {
                  actionType: "plan_this",
                  label: "Plan this",
                  description: "Start a bounded planning handoff in chat.",
                  requiresChatInject: false,
                  executesAction: false,
                },
                messageClass: "operator_approved_suggestion_available",
                boundedDisplayText: "Plan the real live proactivity generation follow-up.",
                candidateSummary: "Plan the real live proactivity generation follow-up.",
                planTitle: "Live proactivity generation follow-up",
                problem:
                  "The inbox and heartbeat need to use the same actionable live item source.",
                suggestedAction: "Plan the live proactivity generation follow-up.",
                messagePreview: "Plan the live proactivity generation follow-up.",
                proposedMessage: "Plan the live proactivity generation follow-up.",
                expectedUserValue:
                  "Makes the heartbeat card actionable even when the inbox is the source of truth.",
                userBenefit:
                  "Makes the heartbeat card actionable even when the inbox is the source of truth.",
                evidenceSummary: "The inbox contains a bounded live actionable item.",
                confidence: "high",
                blockedIfMissing: [],
                status: "pending_review",
                filterTags: ["actionable", "pending"],
                layer: "actionable",
                sourceRefs: ["gateway://system-events/main/system-event-1"],
                sourceProfileIds: ["tool_result_capture"],
                authorityTiers: ["tool_grounded"],
                contentHashes: ["content-hash-heartbeat"],
                proofHashes: ["proof-hash-heartbeat"],
                noDarkDataStatus: "pass",
                feedbackSummary: {
                  positiveFeedbackCount: 0,
                  negativeFeedbackCount: 0,
                  tooRepetitiveCount: 0,
                  wrongContextCount: 0,
                  unsafePrivateCount: 0,
                },
                whyThisAppearedSummary: "Generated from a live runtime event.",
                blockedReasonCodes: [],
              },
            ],
          },
        }),
      ),
      container,
    );

    const entryPoint = container.querySelector(".proactivity-entrypoint__button");
    expect(entryPoint?.textContent).toContain("1 actionable");
    expect(entryPoint?.textContent).toContain("1 heartbeat");
    const review = container.querySelector(".heartbeat-proactivity-review");
    expect(review?.textContent).toContain("What would help this user today?");
    expect(review?.textContent).toContain("Live Proactivity Generation Follow-Up");
    Array.from(review?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("Review in Work Queue"))
      ?.click();
    expect(onOpenWorkQueue).toHaveBeenCalledWith("queue-heartbeat-source");
  });

  it("renders draft-ready heartbeat and inbox items from the canonical work item", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "draft-ready-test",
          proactivityInboxDigest: {
            digestId: "digest-draft-ready",
            generatedAt: "2026-04-27T16:00:00.000Z",
            filters: [
              "actionable",
              "pending",
              "planned",
              "sent",
              "snoozed",
              "dismissed",
              "blocked",
              "autosend_trial",
              "diagnostics",
            ],
            counts: {
              actionable: 1,
              pending: 1,
              planned: 0,
              sent: 0,
              snoozed: 0,
              dismissed: 0,
              blocked: 0,
              autosend_trial: 0,
              diagnostics: 0,
            },
            layerCounts: { actionable: 1, history: 0, diagnostic: 0 },
            items: [
              {
                itemId: "draft-ready-item-1",
                sourceArtifactReportId: "draft-ready-report-1",
                candidateId: "draft-ready-candidate-1",
                opportunityId: "draft-ready-opportunity-1",
                opportunityStatus: "draft_ready",
                queueItemId: "draft-ready-queue-1",
                workItemId: "draft-ready-work-item-1",
                workItemKind: "planning_request",
                workItemStatus: "planned",
                primaryAction: {
                  actionType: "plan_this",
                  label: "Plan this",
                  description: "Starts a bounded planning request in the current chat.",
                  requiresChatInject: false,
                  executesAction: false,
                },
                secondaryActions: [],
                ctaExplanation: "Opens the draft in a bounded planning handoff without execution.",
                handoffStatus: "idle",
                handoffError: null,
                handoffMessageAnchor: null,
                messageClass: "operator_approved_suggestion_available",
                boundedDisplayText: "Plan the generator reset from real assistant output.",
                candidateSummary: "Plan the generator reset from real assistant output.",
                suggestedAction: "Turn the generated opportunity into a bounded planning turn.",
                messagePreview: "Plan the generator reset from real assistant output.",
                planTitle: "Plan the generator reset",
                problem:
                  "Assistant-generated next steps should become proactive work automatically.",
                proposedMessage: "Plan the generator reset from real assistant output.",
                expectedUserValue:
                  "Creates momentum without waiting for the inbox to be opened first.",
                userBenefit: "Creates momentum without waiting for the inbox to be opened first.",
                evidenceSummary:
                  "Assistant planning output produced a concrete next-step opportunity.",
                confidence: "high",
                blockedIfMissing: [],
                draftReady: true,
                autonomousDraft: {
                  draftId: "draft-ready-draft-1",
                  draftKind: "planning_brief",
                  recommendedApproach: "Turn the assistant output into a concise bounded plan.",
                  nextSafeStep: "Review the draft and decide whether to start a planning handoff.",
                  uncertainty: "The draft may already be partly resolved by newer work.",
                  safetyBoundary:
                    "This is an internal bounded draft only. Do not edit files, execute actions, or send outbound messages without explicit approval.",
                },
                resolvedByChatMessageId: null,
                supersededByOpportunityId: null,
                status: "pending_review",
                filterTags: ["actionable", "pending"],
                layer: "actionable",
                attentionRequired: true,
                sendStatus: "idle",
                sendError: null,
                sentMessageAnchor: null,
                sourceRefs: ["chat://draft-ready-test/assistant_turn/msg-1"],
                sourceProfileIds: ["manual_note"],
                authorityTiers: ["tool_grounded"],
                contentHashes: ["content-hash-draft-ready"],
                proofHashes: ["proof-hash-draft-ready"],
                noDarkDataStatus: "pass",
                feedbackSummary: {
                  positiveFeedbackCount: 0,
                  negativeFeedbackCount: 0,
                  tooRepetitiveCount: 0,
                  wrongContextCount: 0,
                  unsafePrivateCount: 0,
                },
                whyThisAppearedSummary:
                  "Generated from the canonical opportunity ledger and elevated because a bounded internal draft is ready for review.",
                blockedReasonCodes: [],
              },
            ],
          },
          productProactivityQueue: [],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("draft ready");
    expect(container.textContent).toContain("Plan the Generator Reset");
    expect(container.textContent).toContain(
      "Turn the generated opportunity into a bounded planning turn.",
    );
    expect(container.textContent).toContain("Review in Work Queue");
  });

  it("renders skillifier draft-ready items from the canonical work item", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "skillifier-test",
          proactivityInboxDigest: {
            digestId: "digest-skillifier",
            generatedAt: "2026-04-28T18:42:00.000Z",
            filters: [
              "actionable",
              "pending",
              "planned",
              "sent",
              "snoozed",
              "dismissed",
              "blocked",
              "autosend_trial",
              "diagnostics",
            ],
            counts: {
              actionable: 1,
              pending: 1,
              planned: 0,
              sent: 0,
              snoozed: 0,
              dismissed: 0,
              blocked: 0,
              autosend_trial: 0,
              diagnostics: 0,
            },
            layerCounts: { actionable: 1, history: 0, diagnostic: 0 },
            items: [
              {
                itemId: "skillifier-item-1",
                sourceArtifactReportId: "skillifier-report-1",
                candidateId: "skillifier-candidate-1",
                opportunityId: "skillifier-opportunity-1",
                opportunityStatus: "draft_ready",
                queueItemId: "skillifier-queue-1",
                workItemId: "skillifier-work-item-1",
                workItemKind: "planning_request",
                workItemStatus: "planned",
                primaryAction: {
                  actionType: "plan_this",
                  label: "Plan this",
                  description: "Starts a bounded planning request in the current chat.",
                  requiresChatInject: false,
                  executesAction: false,
                },
                secondaryActions: [],
                ctaExplanation:
                  "Opens the review-only skill draft in a bounded planning handoff without installation.",
                handoffStatus: "idle",
                handoffError: null,
                handoffMessageAnchor: null,
                messageClass: "operator_approved_suggestion_available",
                boundedDisplayText: "Draft the recurring workflow as a reusable review-only skill.",
                candidateSummary: "Draft the recurring workflow as a reusable review-only skill.",
                suggestedAction:
                  "Review the generated skill package and decide what Milestone 4 should validate next.",
                messagePreview:
                  "Review the generated skill package and decide what Milestone 4 should validate next.",
                planTitle: "Draft the recurring workflow skill",
                problem: "The same bounded workflow keeps recurring across skills-platform work.",
                proposedMessage:
                  "Review the generated skill package and decide what Milestone 4 should validate next.",
                expectedUserValue:
                  "Turns repeated workflow knowledge into a reusable draft without installing anything.",
                userBenefit:
                  "Turns repeated workflow knowledge into a reusable draft without installing anything.",
                evidenceSummary:
                  "Recurring skill-platform workflow signals converged on one bounded candidate.",
                confidence: "high",
                blockedIfMissing: [],
                draftReady: true,
                skillifierDraft: {
                  skillPackageId: "skill-package-1",
                  skillifierReportId: "skillifier-report-1",
                  decision: "draft_ready",
                  packageTitle: "Recurring Workflow Skill Draft",
                  draftPath:
                    "/home/node/.openclaw/workspace/skills/recurring-workflow--draft-1234abcd",
                  reviewSummary: "The draft package is ready for bounded review and eval design.",
                  nextReviewStep:
                    "Inspect the SKILL.md contract and define the first decisioning eval cases.",
                },
                resolvedByChatMessageId: null,
                supersededByOpportunityId: null,
                status: "pending_review",
                filterTags: ["actionable", "pending"],
                layer: "actionable",
                attentionRequired: true,
                sendStatus: "idle",
                sendError: null,
                sentMessageAnchor: null,
                sourceRefs: ["chat://skillifier-test/assistant_turn/msg-1"],
                sourceProfileIds: ["manual_note"],
                authorityTiers: ["tool_grounded"],
                contentHashes: ["content-hash-skillifier"],
                proofHashes: ["proof-hash-skillifier"],
                noDarkDataStatus: "pass",
                feedbackSummary: {
                  positiveFeedbackCount: 0,
                  negativeFeedbackCount: 0,
                  tooRepetitiveCount: 0,
                  wrongContextCount: 0,
                  unsafePrivateCount: 0,
                },
                whyThisAppearedSummary:
                  "Generated from the canonical opportunity ledger and elevated because a bounded skill draft is ready for review.",
                blockedReasonCodes: [],
              },
            ],
          },
          productProactivityQueue: [],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("draft ready");
    expect(container.textContent).toContain("Draft the Recurring Workflow Skill");
    expect(container.textContent).toContain("Review in Work Queue");
    expect(container.textContent).toContain(
      "Review the generated skill package and decide what Milestone 4 should validate next.",
    );
  });

  it("does not surface static diagnostic fallbacks as actionable heartbeat traffic", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessionKey: "main",
          activeProactivityContext: {
            userId: "local-openclaw-user",
            recipientId: "local-openclaw-recipient",
            projectId: "openclaw",
            sessionKey: "main",
            operatorId: "local-openclaw-operator",
            source: "chat_active_session",
          },
          productProactivityQueue: [
            {
              queueItemId: "queue-static-diagnostic",
              candidateId: "candidate-static-diagnostic",
              workItemId: "work-item-static-diagnostic",
              workItemKind: "diagnostic",
              workItemStatus: "blocked",
              primaryAction: null,
              secondaryActions: [],
              ctaExplanation:
                "Static fallback is diagnostics-only until live work creates an item.",
              handoffStatus: "idle",
              handoffError: null,
              handoffMessageAnchor: null,
              messageClass: "operator_approved_suggestion_available",
              boundedDisplayText: "No live proactivity opportunities detected.",
              candidateSummary: "No live proactivity opportunities detected.",
              suggestedAction: "Diagnostics only.",
              expectedUserValue: "Explains why no proactive item is currently shown.",
              planTitle: "No live proactivity opportunities detected",
              problem: "Static/default candidates are no longer primary actionable UX.",
              proposedMessage: "",
              userBenefit: "Prevents fake proactive work from inflating the inbox.",
              evidenceSummary: "No live signal matched the active session.",
              confidence: "low",
              blockedIfMissing: ["live_signal"],
              status: "blocked",
              layer: "diagnostic",
              attentionRequired: false,
              sendStatus: "idle",
              sendError: null,
              sentMessageAnchor: null,
              eligibleScope: {
                environment: "live",
                userId: "local-openclaw-user",
                recipientId: "local-openclaw-recipient",
                projectId: "openclaw",
                sessionKey: "main",
                operatorId: "local-openclaw-operator",
                allowedMessageClasses: ["operator_approved_suggestion_available"],
                proofPrerequisiteIds: ["live-generation-gate"],
                proofPrerequisiteHashes: ["proof-hash-1"],
              },
              sourceRefs: ["diagnostics://model-memory/proactivity/no-live-signal"],
              sourceProfileIds: ["manual_note"],
              authorityTiers: ["tool_grounded"],
              contentHashes: ["content-hash-1"],
              proofHashes: ["proof-hash-1"],
              noDarkDataStatus: "pass",
              staleLabels: [],
              conflictLabels: [],
              blockedReasonCodes: [
                "no_live_opportunities_detected",
                "static_default_candidate_demoted",
              ],
              generatedAt: "2026-04-27T05:00:00.000Z",
              updatedAt: "2026-04-27T05:00:00.000Z",
            },
          ],
        }),
      ),
      container,
    );

    const entryPoint = container.querySelector(".proactivity-entrypoint__button");
    expect(entryPoint).toBeNull();
    expect(container.querySelector(".heartbeat-proactivity-review")).toBeNull();
    expect(container.querySelector(".contextual-proactivity-card")).toBeNull();
  });

  it("renders proactivity as a compact entry point and routes into Work Queue", () => {
    const container = document.createElement("div");
    const onOpenWorkQueue = vi.fn();
    render(
      renderChat(
        createProps({
          onOpenWorkQueue,
          proactivityInboxDigest: {
            digestId: "digest-1",
            generatedAt: "2026-04-26T22:00:00.000Z",
            filters: [
              "actionable",
              "pending",
              "planned",
              "sent",
              "snoozed",
              "dismissed",
              "blocked",
              "autosend_trial",
              "diagnostics",
            ],
            counts: {
              actionable: 2,
              pending: 2,
              planned: 0,
              sent: 1,
              snoozed: 1,
              dismissed: 1,
              blocked: 1,
              autosend_trial: 1,
              diagnostics: 1,
            },
            layerCounts: { actionable: 2, history: 3, diagnostic: 1 },
            items: [
              {
                itemId: "inbox-item-1",
                sourceArtifactReportId: "report-1",
                candidateId: "candidate-1",
                queueItemId: "queue-item-1",
                messageClass: "operator_approved_suggestion_available",
                boundedDisplayText: "An approved operator suggestion is available.",
                candidateSummary: "Follow up on the unresolved gateway rebuild issue.",
                planTitle: "Gateway rebuild follow-up",
                problem: "The live gateway may not include the latest proactivity UX changes.",
                suggestedAction: "Review the gateway rebuild follow-up and send it if still true.",
                messagePreview: "Should we rerun the live gateway rebuild now that UX changed?",
                proposedMessage: "Should we rerun the live gateway rebuild now that UX changed?",
                expectedUserValue: "Keeps the live UI aligned with the latest proactivity changes.",
                userBenefit: "Keeps the live UI aligned with the latest proactivity changes.",
                evidenceSummary:
                  "The active remediation changed proactivity UX and gateway behavior.",
                confidence: "medium" as const,
                blockedIfMissing: [],
                status: "pending_review",
                filterTags: ["actionable", "pending"],
                layer: "actionable",
                sourceRefs: ["docs/projects/model-memory/phase-2-execution-roadmap.md"],
                sourceProfileIds: ["curated_repo_doc"],
                authorityTiers: ["curated_authoritative"],
                contentHashes: ["content-hash-1"],
                proofHashes: ["proof-hash-1"],
                noDarkDataStatus: "pass",
                feedbackSummary: {
                  positiveFeedbackCount: 1,
                  negativeFeedbackCount: 0,
                  tooRepetitiveCount: 0,
                  wrongContextCount: 0,
                  unsafePrivateCount: 0,
                },
                whyThisAppearedSummary:
                  "Generated from approved Model Memory proactivity queue evidence.",
                blockedReasonCodes: [],
              },
              {
                itemId: "inbox-item-2",
                sourceArtifactReportId: "report-2",
                candidateId: "candidate-2",
                messageClass: "autosend_simulation",
                boundedDisplayText:
                  "Auto-send simulation compared would-have-sent behavior to manual decisions.",
                status: "autosend_trial",
                filterTags: ["diagnostics", "autosend_trial"],
                layer: "diagnostic",
                sourceRefs: ["phase2-autosend-simulation"],
                sourceProfileIds: ["manual_note"],
                authorityTiers: ["operator_evaluation"],
                contentHashes: ["content-hash-2"],
                proofHashes: ["proof-hash-2"],
                noDarkDataStatus: "pass",
                feedbackSummary: {
                  positiveFeedbackCount: 1,
                  negativeFeedbackCount: 1,
                  tooRepetitiveCount: 1,
                  wrongContextCount: 1,
                  unsafePrivateCount: 0,
                },
                whyThisAppearedSummary:
                  "Generated from report-only auto-send simulation telemetry.",
                blockedReasonCodes: ["manual_override_required"],
              },
            ],
          },
        }),
      ),
      container,
    );

    const entryPoint = container.querySelector<HTMLButtonElement>(
      ".proactivity-entrypoint__button",
    );
    const thread = container.querySelector(".chat-thread");
    expect(entryPoint).not.toBeNull();
    expect(entryPoint?.textContent).toContain("Work Queue");
    expect(entryPoint?.textContent).toContain("1 actionable");
    expect(container.querySelector(".chat-proactivity-rail")).toBeNull();
    expect(container.querySelector(".proactivity-inbox")).toBeNull();
    expect(thread?.querySelector(".proactivity-inbox")).toBeNull();
    expect(container.textContent).not.toContain("Auto-send simulation");
    entryPoint?.click();
    expect(onOpenWorkQueue).toHaveBeenCalledWith();
  });

  it("renders compiled planning output on planned inbox cards", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sidebarOpen: true,
          sidebarContent: { kind: "proactivityInbox" },
          proactivityInboxView: "planned",
          onCloseSidebar: () => undefined,
          proactivityInboxDigest: {
            digestId: "digest-planned",
            generatedAt: "2026-04-26T22:30:00.000Z",
            filters: [
              "actionable",
              "pending",
              "planned",
              "sent",
              "snoozed",
              "dismissed",
              "blocked",
              "autosend_trial",
              "diagnostics",
            ],
            counts: {
              actionable: 0,
              pending: 0,
              planned: 1,
              sent: 0,
              snoozed: 0,
              dismissed: 0,
              blocked: 0,
              autosend_trial: 0,
              diagnostics: 0,
            },
            layerCounts: { actionable: 0, history: 1, diagnostic: 0 },
            items: [
              {
                itemId: "planned-item-1",
                sourceArtifactReportId: "report-planned",
                candidateId: "candidate-planned",
                queueItemId: "queue-planned",
                messageClass: "operator_approved_suggestion_available",
                boundedDisplayText: "A compiled planning output is ready.",
                planTitle: "Memory Capture Release Gate",
                problem: "The release gate needs a durable plan visible outside transient chat.",
                proposedMessage: "Review the compiled release gate plan.",
                expectedUserValue: "Keeps the plan reviewable after a new chat starts.",
                evidenceSummary: "Planning output was captured from the assistant response.",
                confidence: "high" as const,
                blockedIfMissing: [],
                status: "planned",
                filterTags: ["planned"],
                layer: "history",
                sourceRefs: ["chat://main/assistant/plan-output"],
                sourceProfileIds: ["cited_assistant_answer"],
                authorityTiers: ["cited_soft"],
                contentHashes: ["planned-content-hash"],
                proofHashes: ["planned-proof-hash"],
                noDarkDataStatus: "pass",
                feedbackSummary: {
                  positiveFeedbackCount: 1,
                  negativeFeedbackCount: 0,
                  tooRepetitiveCount: 0,
                  wrongContextCount: 0,
                  unsafePrivateCount: 0,
                },
                whyThisAppearedSummary: "The operator requested a plan from a model-authored card.",
                blockedReasonCodes: [],
                handoffMessageAnchor: "chat-message:queue-planned",
                plannedArtifact: {
                  status: "compiled",
                  title: "memory capture release gate",
                  requestSummary: "Create a plan for the memory capture release gate.",
                  compiledPlan:
                    "## memory capture release gate\n\n- Verify direct proof.\n- Verify live gateway wiring.",
                  sourceRunId: "run-planned",
                  sourceMessageId: "assistant-planned",
                  generatedAt: "2026-04-26T22:25:00.000Z",
                  updatedAt: "2026-04-26T22:29:00.000Z",
                },
              },
            ],
          },
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Compiled plan");
    expect(container.textContent).toContain("Memory Capture Release Gate");
    expect(container.textContent).toContain("Verify direct proof.");
    expect(container.textContent).toContain("Finalize Recommendation");
    expect(container.textContent).toContain("Request Revision");
    expect(container.textContent).toContain("Execution Approval Unavailable");
    expect(container.textContent).toContain("Plan request and provenance");
    expect(container.textContent).toContain("run-planned");
  });

  it("dismisses BTW side results from the dismiss button", () => {
    const container = document.createElement("div");
    const onDismissSideResult = vi.fn();
    render(
      renderChat(
        createProps({
          sideResult: {
            kind: "btw",
            runId: "btw-run-2",
            sessionKey: "main",
            question: "what changed?",
            text: "Dismiss me",
            isError: false,
            ts: 3,
          },
          onDismissSideResult,
        }),
      ),
      container,
    );

    const button = container.querySelector<HTMLButtonElement>(".chat-side-result__dismiss");
    expect(button).not.toBeNull();
    button?.click();
    expect(onDismissSideResult).toHaveBeenCalledTimes(1);
  });

  it("renders BTW errors with the error variant", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sideResult: {
            kind: "btw",
            runId: "btw-run-3",
            sessionKey: "main",
            question: "what failed?",
            text: "The side question could not be answered.",
            isError: true,
            ts: 4,
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-side-result--error")).not.toBeNull();
  });

  it("hides the context notice when only cumulative inputTokens exceed the limit", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessions: {
            ts: 0,
            path: "",
            count: 1,
            defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: 200_000 },
            sessions: [
              {
                key: "main",
                kind: "direct",
                updatedAt: null,
                inputTokens: 757_300,
                totalTokens: 46_000,
                contextTokens: 200_000,
              },
            ],
          },
        }),
      ),
      container,
    );

    expect(container.textContent).not.toContain("context used");
    expect(container.textContent).not.toContain("757.3k / 200k");
  });

  it("uses totalTokens for the context notice detail when current usage is high", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessions: {
            ts: 0,
            path: "",
            count: 1,
            defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: 200_000 },
            sessions: [
              {
                key: "main",
                kind: "direct",
                updatedAt: null,
                inputTokens: 757_300,
                totalTokens: 190_000,
                contextTokens: 200_000,
              },
            ],
          },
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("95% context used");
    expect(container.textContent).toContain("190k / 200k");
    expect(container.textContent).not.toContain("757.3k / 200k");
  });

  it("hides the context notice when totalTokens is missing even if inputTokens is high", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessions: {
            ts: 0,
            path: "",
            count: 1,
            defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: 200_000 },
            sessions: [
              {
                key: "main",
                kind: "direct",
                updatedAt: null,
                inputTokens: 500_000,
                contextTokens: 200_000,
              },
            ],
          },
        }),
      ),
      container,
    );

    expect(container.textContent).not.toContain("context used");
  });

  it("hides the context notice when totalTokens is marked stale", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          sessions: {
            ts: 0,
            path: "",
            count: 1,
            defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: 200_000 },
            sessions: [
              {
                key: "main",
                kind: "direct",
                updatedAt: null,
                totalTokens: 190_000,
                totalTokensFresh: false,
                contextTokens: 200_000,
              },
            ],
          },
        }),
      ),
      container,
    );

    expect(container.textContent).not.toContain("context used");
    expect(container.textContent).not.toContain("190k / 200k");
  });

  it("uses the assistant avatar URL for the welcome state when the identity avatar is only initials", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          assistantName: "Assistant",
          assistantAvatar: "A",
          assistantAvatarUrl: "/avatar/main",
        }),
      ),
      container,
    );

    const welcomeImage = container.querySelector<HTMLImageElement>(".agent-chat__welcome > img");
    expect(welcomeImage).not.toBeNull();
    expect(welcomeImage?.getAttribute("src")).toBe("/avatar/main");
  });

  it("falls back to the bundled logo in the welcome state when the assistant avatar is not a URL", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          assistantName: "Assistant",
          assistantAvatar: "A",
          assistantAvatarUrl: null,
        }),
      ),
      container,
    );

    const welcomeImage = container.querySelector<HTMLImageElement>(".agent-chat__welcome > img");
    const logoImage = container.querySelector<HTMLImageElement>(
      ".agent-chat__welcome .agent-chat__avatar--logo img",
    );
    expect(welcomeImage).toBeNull();
    expect(logoImage).not.toBeNull();
    expect(logoImage?.getAttribute("src")).toBe("favicon.svg");
  });

  it("keeps the welcome logo fallback under the mounted base path", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          assistantName: "Assistant",
          assistantAvatar: "A",
          assistantAvatarUrl: null,
          basePath: "/openclaw/",
        }),
      ),
      container,
    );

    const logoImage = container.querySelector<HTMLImageElement>(
      ".agent-chat__welcome .agent-chat__avatar--logo img",
    );
    expect(logoImage).not.toBeNull();
    expect(logoImage?.getAttribute("src")).toBe("/openclaw/favicon.svg");
  });

  it("keeps grouped assistant avatar fallbacks under the mounted base path", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          assistantName: "Assistant",
          assistantAvatar: "A",
          assistantAvatarUrl: null,
          basePath: "/openclaw/",
          messages: [
            {
              role: "assistant",
              content: "hello",
              timestamp: 1000,
            },
          ],
        }),
      ),
      container,
    );

    const groupedLogo = container.querySelector<HTMLImageElement>(
      ".chat-group.assistant .chat-avatar--logo",
    );
    expect(groupedLogo).not.toBeNull();
    expect(groupedLogo?.getAttribute("src")).toBe("/openclaw/favicon.svg");
  });

  it("keeps the persisted overview locale selected before i18n hydration finishes", async () => {
    const container = document.createElement("div");
    const props = createOverviewProps({
      settings: {
        ...createOverviewProps().settings,
        locale: "zh-CN",
      },
    });

    getSafeLocalStorage()?.clear();
    await i18n.setLocale("en");

    render(renderOverview(props), container);
    await Promise.resolve();

    let select = container.querySelector<HTMLSelectElement>("select");
    expect(i18n.getLocale()).toBe("en");
    expect(select?.value).toBe("zh-CN");
    expect(select?.selectedOptions[0]?.textContent?.trim()).toBe("简体中文 (Simplified Chinese)");

    await i18n.setLocale("zh-CN");
    render(renderOverview(props), container);
    await Promise.resolve();

    select = container.querySelector<HTMLSelectElement>("select");
    expect(select?.value).toBe("zh-CN");
    expect(select?.selectedOptions[0]?.textContent?.trim()).toBe("简体中文 (简体中文)");

    await i18n.setLocale("en");
  });

  it("renders compacting indicator as a badge", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          compactionStatus: {
            phase: "active",
            runId: "run-1",
            startedAt: Date.now(),
            completedAt: null,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--active");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Compacting context...");
  });

  it("renders completion indicator shortly after compaction", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      renderChat(
        createProps({
          compactionStatus: {
            phase: "complete",
            runId: "run-1",
            startedAt: 900,
            completedAt: 900,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--complete");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Context compacted");
    nowSpy.mockRestore();
  });

  it("hides stale compaction completion indicator", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    render(
      renderChat(
        createProps({
          compactionStatus: {
            phase: "complete",
            runId: "run-1",
            startedAt: 0,
            completedAt: 0,
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".compaction-indicator")).toBeNull();
    nowSpy.mockRestore();
  });

  it("renders fallback indicator shortly after fallback event", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      renderChat(
        createProps({
          fallbackStatus: {
            selected: "fireworks/minimax-m2p5",
            active: "deepinfra/moonshotai/Kimi-K2.5",
            attempts: ["fireworks/minimax-m2p5: rate limit"],
            occurredAt: 900,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--fallback");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Fallback active: deepinfra/moonshotai/Kimi-K2.5");
    nowSpy.mockRestore();
  });

  it("hides stale fallback indicator", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(20_000);
    render(
      renderChat(
        createProps({
          fallbackStatus: {
            selected: "fireworks/minimax-m2p5",
            active: "deepinfra/moonshotai/Kimi-K2.5",
            attempts: [],
            occurredAt: 0,
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".compaction-indicator--fallback")).toBeNull();
    nowSpy.mockRestore();
  });

  it("renders fallback-cleared indicator shortly after transition", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      renderChat(
        createProps({
          fallbackStatus: {
            phase: "cleared",
            selected: "fireworks/minimax-m2p5",
            active: "fireworks/minimax-m2p5",
            previous: "deepinfra/moonshotai/Kimi-K2.5",
            attempts: [],
            occurredAt: 900,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--fallback-cleared");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Fallback cleared: fireworks/minimax-m2p5");
    nowSpy.mockRestore();
  });

  it("shows a stop button when aborting is available", () => {
    const container = document.createElement("div");
    const onAbort = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: true,
          sending: true,
          onAbort,
        }),
      ),
      container,
    );

    const stopButton = container.querySelector<HTMLButtonElement>('button[title="Stop"]');
    expect(stopButton).not.toBeUndefined();
    stopButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("New session");
  });

  it("keeps queue submission available while a run can be aborted", () => {
    const container = document.createElement("div");
    const onSend = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: true,
          sending: true,
          draft: "queued while running",
          onAbort: vi.fn(),
          onSend,
        }),
      ),
      container,
    );

    const stopButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Stop generating"]',
    );
    const queueButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Queue message"]',
    );
    expect(stopButton).not.toBeNull();
    expect(queueButton).not.toBeNull();
    queueButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("keeps the stop button visible for abortable non-streaming runs", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          canAbort: true,
          sending: false,
          stream: null,
          onAbort: vi.fn(),
        }),
      ),
      container,
    );

    const stopButton = container.querySelector<HTMLButtonElement>('button[title="Stop"]');
    expect(stopButton).not.toBeNull();
    expect(container.textContent).not.toContain("New session");
  });

  it("shows a new session button when aborting is unavailable", () => {
    const container = document.createElement("div");
    const onNewSession = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: false,
          onNewSession,
        }),
      ),
      container,
    );

    const newSessionButton = container.querySelector<HTMLButtonElement>(
      'button[title="New session"]',
    );
    expect(newSessionButton).not.toBeUndefined();
    newSessionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNewSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Stop");
  });

  it("shows sender labels from sanitized gateway messages instead of generic You", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "user",
              content: "hello from topic",
              senderLabel: "Iris",
              timestamp: 1000,
            },
          ],
        }),
      ),
      container,
    );

    const senderLabels = Array.from(container.querySelectorAll(".chat-sender-name")).map((node) =>
      node.textContent?.trim(),
    );
    expect(senderLabels).toContain("Iris");
    expect(senderLabels).not.toContain("You");
  });

  it("keeps consecutive user messages from different senders in separate groups", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "user",
              content: "first",
              senderLabel: "Iris",
              timestamp: 1000,
            },
            {
              role: "user",
              content: "second",
              senderLabel: "Joaquin De Rojas",
              timestamp: 1001,
            },
          ],
        }),
      ),
      container,
    );

    const groups = container.querySelectorAll(".chat-group.user");
    expect(groups).toHaveLength(2);
    const senderLabels = Array.from(container.querySelectorAll(".chat-sender-name")).map((node) =>
      node.textContent?.trim(),
    );
    expect(senderLabels).toContain("Iris");
    expect(senderLabels).toContain("Joaquin De Rojas");
  });

  it("opens delete confirm on the left for user messages", () => {
    try {
      getSafeLocalStorage()?.removeItem("openclaw:skipDeleteConfirm");
    } catch {
      /* noop */
    }
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "user",
              content: "hello from user",
              timestamp: 1000,
            },
          ],
        }),
      ),
      container,
    );

    const deleteButton = container.querySelector<HTMLButtonElement>(
      ".chat-group.user .chat-group-delete",
    );
    expect(deleteButton).not.toBeNull();
    deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const confirm = container.querySelector<HTMLElement>(".chat-group.user .chat-delete-confirm");
    expect(confirm).not.toBeNull();
    expect(confirm?.classList.contains("chat-delete-confirm--left")).toBe(true);
  });

  it("opens delete confirm on the right for assistant messages", () => {
    try {
      getSafeLocalStorage()?.removeItem("openclaw:skipDeleteConfirm");
    } catch {
      /* noop */
    }
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          messages: [
            {
              role: "assistant",
              content: "hello from assistant",
              timestamp: 1000,
            },
          ],
        }),
      ),
      container,
    );

    const deleteButton = container.querySelector<HTMLButtonElement>(
      ".chat-group.assistant .chat-group-delete",
    );
    expect(deleteButton).not.toBeNull();
    deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const confirm = container.querySelector<HTMLElement>(
      ".chat-group.assistant .chat-delete-confirm",
    );
    expect(confirm).not.toBeNull();
    expect(confirm?.classList.contains("chat-delete-confirm--right")).toBe(true);
  });

  it("patches the current session model from the chat header picker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      } satisfies Partial<Response>),
    );
    const { state, request } = createChatHeaderState();
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect).not.toBeNull();
    expect(modelSelect?.value).toBe("");

    modelSelect!.value = "openai/gpt-5-mini";
    modelSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    await flushTasks();

    expect(request).toHaveBeenCalledWith("sessions.patch", {
      key: "main",
      model: "openai/gpt-5-mini",
    });
    expect(request).not.toHaveBeenCalledWith("chat.history", expect.anything());
    expect(state.sessionsResult?.sessions[0]?.model).toBe("gpt-5-mini");
    expect(state.sessionsResult?.sessions[0]?.modelProvider).toBe("openai");
    vi.unstubAllGlobals();
  });

  it("reloads effective tools after a chat-header model switch for the active tools panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      } satisfies Partial<Response>),
    );
    const { state, request } = createChatHeaderState();
    state.agentsPanel = "tools";
    state.agentsSelectedId = "main";
    state.toolsEffectiveResultKey = "main:main";
    state.toolsEffectiveResult = {
      agentId: "main",
      profile: "coding",
      groups: [],
    };
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect).not.toBeNull();

    modelSelect!.value = "openai/gpt-5-mini";
    modelSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    await flushTasks();

    expect(request).toHaveBeenCalledWith("tools.effective", {
      agentId: "main",
      sessionKey: "main",
    });
    expect(state.toolsEffectiveResultKey).toBe("main:main:model=openai/gpt-5-mini");
    vi.unstubAllGlobals();
  });

  it("clears the session model override back to the default model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      } satisfies Partial<Response>),
    );
    const { state, request } = createChatHeaderState({ model: "gpt-5-mini" });
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect).not.toBeNull();
    expect(modelSelect?.value).toBe("openai/gpt-5-mini");

    modelSelect!.value = "";
    modelSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    await flushTasks();

    expect(request).toHaveBeenCalledWith("sessions.patch", {
      key: "main",
      model: null,
    });
    expect(state.sessionsResult?.sessions[0]?.model).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("disables the chat header model picker while a run is active", () => {
    const { state } = createChatHeaderState();
    state.chatRunId = "run-123";
    state.chatStream = "Working";
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect).not.toBeNull();
    expect(modelSelect?.disabled).toBe(true);
  });

  it("keeps the selected model visible when the active session is absent from sessions.list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      } satisfies Partial<Response>),
    );
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect).not.toBeNull();

    modelSelect!.value = "openai/gpt-5-mini";
    modelSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    await flushTasks();
    render(renderChatSessionSelect(state), container);

    const rerendered = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(rerendered?.value).toBe("openai/gpt-5-mini");
    vi.unstubAllGlobals();
  });

  it("normalizes cached bare /model overrides to the matching catalog option", () => {
    const { state } = createChatHeaderState();
    state.chatModelOverrides = { main: { kind: "raw", value: "gpt-5-mini" } };

    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect).not.toBeNull();
    expect(modelSelect?.value).toBe("openai/gpt-5-mini");

    const optionValues = Array.from(modelSelect?.querySelectorAll("option") ?? []).map(
      (option) => option.value,
    );
    expect(optionValues).toContain("openai/gpt-5-mini");
    expect(optionValues).not.toContain("gpt-5-mini");
  });

  it("prefers the catalog provider when the active session reports a stale provider", () => {
    const { state } = createChatHeaderState({
      model: "deepseek-chat",
      modelProvider: "zai",
      models: createModelCatalog(DEEPSEEK_CHAT_MODEL),
    });

    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect?.value).toBe("deepseek/deepseek-chat");
  });

  it("falls back to the server-qualified session model when catalog lookup fails", () => {
    const { state } = createChatHeaderState({
      model: "gpt-5-mini",
      models: [],
    });

    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const modelSelect = container.querySelector<HTMLSelectElement>(
      'select[data-chat-model-select="true"]',
    );
    expect(modelSelect?.value).toBe("openai/gpt-5-mini");

    const optionValues = Array.from(modelSelect?.querySelectorAll("option") ?? []).map(
      (option) => option.value,
    );
    expect(optionValues).toContain("openai/gpt-5-mini");
    expect(optionValues).not.toContain("gpt-5-mini");
  });

  it("prefers the session label over displayName in the grouped chat session selector", () => {
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    state.sessionKey = "agent:main:subagent:4f2146de-887b-4176-9abe-91140082959b";
    state.settings.sessionKey = state.sessionKey;
    state.sessionsResult = {
      ts: 0,
      path: "",
      count: 1,
      defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
      sessions: [
        {
          key: state.sessionKey,
          kind: "direct",
          updatedAt: null,
          label: "cron-config-check",
          displayName: "webchat:g-agent-main-subagent-4f2146de-887b-4176-9abe-91140082959b",
        },
      ],
    };
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const [sessionSelect] = Array.from(container.querySelectorAll<HTMLSelectElement>("select"));
    const labels = Array.from(sessionSelect?.querySelectorAll("option") ?? []).map((option) =>
      option.textContent?.trim(),
    );

    expect(labels).toContain("Subagent: cron-config-check");
    expect(labels).not.toContain(state.sessionKey);
    expect(labels).not.toContain(
      "subagent:4f2146de-887b-4176-9abe-91140082959b · webchat:g-agent-main-subagent-4f2146de-887b-4176-9abe-91140082959b",
    );
    expect(sessionSelect?.getAttribute("aria-label")).toBe("Select session");
  });

  it("keeps a unique scoped fallback when the current grouped session is missing from sessions.list", () => {
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    state.sessionKey = "agent:main:subagent:4f2146de-887b-4176-9abe-91140082959b";
    state.settings.sessionKey = state.sessionKey;
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const [sessionSelect] = Array.from(container.querySelectorAll<HTMLSelectElement>("select"));
    const labels = Array.from(sessionSelect?.querySelectorAll("option") ?? []).map((option) =>
      option.textContent?.trim(),
    );

    expect(labels).toContain("subagent:4f2146de-887b-4176-9abe-91140082959b");
    expect(labels).not.toContain("Subagent:");
  });

  it("keeps a unique scoped fallback when a grouped session row has no label or displayName", () => {
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    state.sessionKey = "agent:main:subagent:4f2146de-887b-4176-9abe-91140082959b";
    state.settings.sessionKey = state.sessionKey;
    state.sessionsResult = {
      ts: 0,
      path: "",
      count: 1,
      defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
      sessions: [
        {
          key: state.sessionKey,
          kind: "direct",
          updatedAt: null,
        },
      ],
    };
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const [sessionSelect] = Array.from(container.querySelectorAll<HTMLSelectElement>("select"));
    const labels = Array.from(sessionSelect?.querySelectorAll("option") ?? []).map((option) =>
      option.textContent?.trim(),
    );

    expect(labels).toContain("subagent:4f2146de-887b-4176-9abe-91140082959b");
    expect(labels).not.toContain("Subagent:");
  });

  it("disambiguates duplicate grouped labels with the scoped key suffix", () => {
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    state.sessionKey = "agent:main:subagent:4f2146de-887b-4176-9abe-91140082959b";
    state.settings.sessionKey = state.sessionKey;
    state.sessionsResult = {
      ts: 0,
      path: "",
      count: 2,
      defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
      sessions: [
        {
          key: "agent:main:subagent:4f2146de-887b-4176-9abe-91140082959b",
          kind: "direct",
          updatedAt: null,
          label: "cron-config-check",
        },
        {
          key: "agent:main:subagent:6fb8b84b-c31f-410f-b7df-1553c82e43c9",
          kind: "direct",
          updatedAt: null,
          label: "cron-config-check",
        },
      ],
    };
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const [sessionSelect] = Array.from(container.querySelectorAll<HTMLSelectElement>("select"));
    const labels = Array.from(sessionSelect?.querySelectorAll("option") ?? []).map((option) =>
      option.textContent?.trim(),
    );

    expect(labels).toContain(
      "Subagent: cron-config-check · subagent:4f2146de-887b-4176-9abe-91140082959b",
    );
    expect(labels).toContain(
      "Subagent: cron-config-check · subagent:6fb8b84b-c31f-410f-b7df-1553c82e43c9",
    );
    expect(labels).not.toContain("Subagent: cron-config-check");
  });

  it("evicts stale session options when the selector rerenders with a smaller live session set", () => {
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    state.sessionKey = "agent:main:main";
    state.settings.sessionKey = state.sessionKey;
    state.sessionsResult = {
      ts: 0,
      path: "",
      count: 5,
      defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
      sessions: [
        {
          key: "agent:main:main",
          kind: "direct",
          updatedAt: null,
          displayName: "Main Session",
        },
        {
          key: "agent:main:codex-live-progress-generic",
          kind: "direct",
          updatedAt: null,
        },
        {
          key: "agent:main:codex-live-progress-generic2",
          kind: "direct",
          updatedAt: null,
        },
        {
          key: "agent:main:codex-live-progress-generic4",
          kind: "direct",
          updatedAt: null,
        },
        {
          key: "agent:main:codex-live-progress-generic5",
          kind: "direct",
          updatedAt: null,
        },
      ],
    };

    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    state.sessionsResult = {
      ts: 1,
      path: "",
      count: 1,
      defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
      sessions: [
        {
          key: "agent:main:main",
          kind: "direct",
          updatedAt: null,
          displayName: "Main Session",
        },
      ],
    };
    render(renderChatSessionSelect(state), container);

    const [sessionSelect] = Array.from(container.querySelectorAll<HTMLSelectElement>("select"));
    const optionValues = Array.from(sessionSelect?.querySelectorAll("option") ?? []).map(
      (option) => option.value,
    );

    expect(optionValues).toEqual(["agent:main:main"]);
    expect(optionValues.some((value) => value.includes("codex-live-progress"))).toBe(false);
  });

  it("prefixes duplicate agent session labels with the agent name", () => {
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    state.sessionKey = "agent:alpha:main";
    state.settings.sessionKey = state.sessionKey;
    state.agentsList = {
      defaultId: "alpha",
      mainKey: "agent:alpha:main",
      scope: "all",
      agents: [
        { id: "alpha", name: "Deep Chat" },
        { id: "beta", name: "Coding" },
      ],
    };
    state.sessionsResult = {
      ts: 0,
      path: "",
      count: 2,
      defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
      sessions: [
        {
          key: "agent:alpha:main",
          kind: "direct",
          updatedAt: null,
        },
        {
          key: "agent:beta:main",
          kind: "direct",
          updatedAt: null,
        },
      ],
    };
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const [sessionSelect] = Array.from(container.querySelectorAll<HTMLSelectElement>("select"));
    const labels = Array.from(sessionSelect?.querySelectorAll("option") ?? []).map((option) =>
      option.textContent?.trim(),
    );

    expect(labels).toContain("Deep Chat / main");
    expect(labels).toContain("Coding / main");
    expect(labels).not.toContain("main");
  });

  it("keeps agent-prefixed labels unique when a custom label already matches the prefix", () => {
    const { state } = createChatHeaderState({ omitSessionFromList: true });
    state.sessionKey = "agent:alpha:main";
    state.settings.sessionKey = state.sessionKey;
    state.agentsList = {
      defaultId: "alpha",
      mainKey: "agent:alpha:main",
      scope: "all",
      agents: [
        { id: "alpha", name: "Deep Chat" },
        { id: "beta", name: "Coding" },
      ],
    };
    state.sessionsResult = {
      ts: 0,
      path: "",
      count: 3,
      defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
      sessions: [
        {
          key: "agent:alpha:main",
          kind: "direct",
          updatedAt: null,
        },
        {
          key: "agent:beta:main",
          kind: "direct",
          updatedAt: null,
        },
        {
          key: "agent:alpha:named-main",
          kind: "direct",
          updatedAt: null,
          label: "Deep Chat (alpha) / main",
        },
      ],
    };
    const container = document.createElement("div");
    render(renderChatSessionSelect(state), container);

    const [sessionSelect] = Array.from(container.querySelectorAll<HTMLSelectElement>("select"));
    const labels = Array.from(sessionSelect?.querySelectorAll("option") ?? []).map((option) =>
      option.textContent?.trim(),
    );

    expect(labels.filter((label) => label === "Deep Chat / main")).toHaveLength(1);
    expect(labels).toContain("Deep Chat (alpha) / main");
    expect(labels).toContain("Coding / main");
  });

  it("keeps tool cards collapsed by default and expands them inline on demand", async () => {
    const container = document.createElement("div");
    const props = createProps({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          toolCallId: "call-1",
          content: [
            {
              type: "toolcall",
              id: "call-1",
              name: "browser.open",
              arguments: { url: "https://example.com" },
            },
            {
              type: "toolresult",
              id: "call-1",
              name: "browser.open",
              text: "Opened page",
            },
          ],
          timestamp: Date.now(),
        },
      ],
    });

    const rerender = () => {
      render(renderChat({ ...props, onRequestUpdate: rerender }), container);
    };
    rerender();

    expect(container.textContent).not.toContain("Input");
    expect(container.textContent).not.toContain("Output");

    container
      .querySelector<HTMLElement>(".chat-tool-msg-summary")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTasks();

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain("Tool output");
    expect(container.textContent).toContain("https://example.com");
    expect(container.textContent).toContain("Opened page");

    container
      .querySelector<HTMLElement>(".chat-tool-msg-summary")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTasks();

    expect(container.textContent).not.toContain("Tool input");
    expect(container.textContent).not.toContain("Opened page");
  });

  it("auto-expands new tool cards inline when the preference is enabled", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          autoExpandToolCalls: true,
          messages: [
            {
              id: "assistant-2",
              role: "assistant",
              toolCallId: "call-2",
              content: [
                {
                  type: "toolcall",
                  id: "call-2",
                  name: "browser.open",
                  arguments: { url: "https://example.com" },
                },
                {
                  type: "toolresult",
                  id: "call-2",
                  name: "browser.open",
                  text: "Opened page",
                },
              ],
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain("Tool output");
    expect(container.textContent).toContain("https://example.com");
  });

  it("expands already-visible tool cards when auto-expand is turned on", () => {
    const container = document.createElement("div");
    const baseProps = createProps({
      messages: [
        {
          id: "assistant-3",
          role: "assistant",
          toolCallId: "call-3",
          content: [
            {
              type: "toolcall",
              id: "call-3",
              name: "browser.open",
              arguments: { url: "https://example.com" },
            },
            {
              type: "toolresult",
              id: "call-3",
              name: "browser.open",
              text: "Opened page",
            },
          ],
          timestamp: Date.now(),
        },
      ],
    });

    render(renderChat(baseProps), container);
    expect(container.textContent).not.toContain("Input");

    render(renderChat({ ...baseProps, autoExpandToolCalls: true }), container);
    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain("Tool output");
  });

  it("lets an auto-expanded tool call collapse again from the summary row", async () => {
    const container = document.createElement("div");
    const props = createProps({
      autoExpandToolCalls: true,
      messages: [
        {
          id: "assistant-3b",
          role: "assistant",
          toolCallId: "call-3b",
          content: [
            {
              type: "toolcall",
              id: "call-3b",
              name: "browser.open",
              arguments: { url: "https://example.com" },
            },
            {
              type: "toolresult",
              id: "call-3b",
              name: "browser.open",
              text: "Opened page",
            },
          ],
          timestamp: Date.now(),
        },
      ],
    });

    const rerender = () => {
      render(renderChat({ ...props, onRequestUpdate: rerender }), container);
    };
    rerender();

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain("Opened page");

    container
      .querySelector<HTMLElement>(".chat-tool-msg-summary")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTasks();

    expect(container.textContent).not.toContain("Tool input");
    expect(container.textContent).not.toContain("Opened page");
  });

  it("keeps expanded input-only tool calls from rendering a redundant output block", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          autoExpandToolCalls: true,
          messages: [
            {
              id: "assistant-4",
              role: "assistant",
              toolCallId: "call-4",
              content: [
                {
                  type: "toolcall",
                  id: "call-4",
                  name: "sessions_spawn",
                  arguments: { mode: "session", thread: true },
                },
              ],
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain('"thread": true');
    expect(container.textContent).not.toContain("Tool output");
    expect(container.textContent).not.toContain("No output");
  });

  it("routes standalone tool-call rows through the same top-level disclosure as tool output", async () => {
    const container = document.createElement("div");
    const props = createProps({
      messages: [
        {
          id: "assistant-4b",
          role: "assistant",
          toolCallId: "call-4b",
          content: [
            {
              type: "toolcall",
              id: "call-4b",
              name: "sessions_spawn",
              arguments: { mode: "session", thread: true },
            },
          ],
          timestamp: Date.now(),
        },
      ],
    });

    const rerender = () => {
      render(renderChat({ ...props, onRequestUpdate: rerender }), container);
    };
    rerender();

    const summary = container.querySelector<HTMLElement>(".chat-tool-msg-summary");
    expect(summary?.textContent).toContain("Tool call");
    expect(container.textContent).not.toContain('"thread": true');

    summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTasks();

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain('"thread": true');

    summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTasks();

    expect(container.textContent).not.toContain("Tool input");
    expect(container.textContent).not.toContain('"thread": true');
  });

  it("auto-expand opens separate tool output rows and their json content", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          autoExpandToolCalls: true,
          messages: [
            {
              id: "assistant-5",
              role: "assistant",
              toolCallId: "call-5",
              content: [
                {
                  type: "toolcall",
                  id: "call-5",
                  name: "sessions_spawn",
                  arguments: { mode: "session", thread: true },
                },
              ],
              timestamp: Date.now(),
            },
            {
              id: "tool-5",
              role: "tool",
              toolCallId: "call-5",
              toolName: "sessions_spawn",
              content: JSON.stringify(
                {
                  status: "error",
                  error: "Session mode is unavailable for this target.",
                  childSessionKey: "agent:test:subagent:abc123",
                },
                null,
                2,
              ),
              timestamp: Date.now() + 1,
            },
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain('"thread": true');
    expect(container.textContent).toContain("Tool output");
    expect(container.textContent).toContain('"status": "error"');
    expect(container.textContent).toContain('"childSessionKey": "agent:test:subagent:abc123"');
  });

  it("does not render tool-row canvas previews", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          autoExpandToolCalls: true,
          messages: [
            {
              id: "tool-anki-1",
              role: "tool",
              toolCallId: "call-anki-1",
              toolName: "canvas_render",
              content: JSON.stringify({
                kind: "canvas",
                source: {
                  type: "html",
                  content: "<div>Front card</div>",
                },
                presentation: {
                  target: "tool_card",
                  title: "Status view",
                },
              }),
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-tool-card__preview-frame")).toBeNull();
    expect(container.textContent).toContain("Status view");
    expect(container.textContent).toContain("Tool output");
  });

  it("renders [embed] shortcodes inside the assistant bubble", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          messages: [
            {
              id: "assistant-anki-inline",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: 'Still the same current card.\n[embed ref="cv_shortcode" title="Shortcode view" /]',
                },
              ],
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-tool-card__preview-frame")).not.toBeNull();
    expect(container.textContent).toContain("Still the same current card.");
    expect(container.textContent).toContain("Shortcode view");
  });

  it("renders canvas-only assistant bubbles", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          messages: [
            {
              id: "assistant-canvas-only",
              role: "assistant",
              content: [{ type: "text", text: '[embed ref="cv_tictactoe" title="Tic-Tac-Toe" /]' }],
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-bubble")).not.toBeNull();
    expect(container.querySelector(".chat-tool-card__preview-frame")).not.toBeNull();
    expect(container.textContent).toContain("Tic-Tac-Toe");
  });

  it("renders assistant_message canvas results inside the assistant bubble when tool rows are hidden", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          messages: [
            {
              id: "assistant-canvas-inline",
              role: "assistant",
              content: [{ type: "text", text: "Inline canvas result." }],
              timestamp: Date.now(),
            },
          ],
          toolMessages: [
            {
              id: "tool-artifact-inline",
              role: "tool",
              toolCallId: "call-artifact-inline",
              toolName: "canvas_render",
              content: JSON.stringify({
                kind: "canvas",
                view: {
                  backend: "canvas",
                  id: "cv_inline",
                  url: "/__openclaw__/canvas/documents/cv_inline/index.html",
                  title: "Inline demo",
                  preferred_height: 360,
                },
                presentation: {
                  target: "assistant_message",
                },
              }),
              timestamp: Date.now() + 1,
            },
          ],
        }),
      ),
      container,
    );

    const iframe = container.querySelector<HTMLIFrameElement>(".chat-tool-card__preview-frame");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("src")).toBe("/__openclaw__/canvas/documents/cv_inline/index.html");
    expect(container.textContent).toContain("Inline canvas result.");
    expect(container.textContent).toContain("Inline demo");
    expect(container.textContent).toContain("Raw details");
  });

  it("uses trusted embed sandbox mode when configured", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          embedSandboxMode: "trusted",
          messages: [
            {
              id: "assistant-canvas-isolated",
              role: "assistant",
              content: [{ type: "text", text: "Inline canvas result." }],
              timestamp: Date.now(),
            },
          ],
          toolMessages: [
            {
              id: "tool-artifact-inline-isolated",
              role: "tool",
              toolCallId: "call-artifact-inline-isolated",
              toolName: "canvas_render",
              content: JSON.stringify({
                kind: "canvas",
                view: {
                  backend: "canvas",
                  id: "cv_inline_isolated",
                  url: "/__openclaw__/canvas/documents/cv_inline_isolated/index.html",
                  title: "Inline demo",
                  preferred_height: 360,
                },
                presentation: {
                  target: "assistant_message",
                },
              }),
              timestamp: Date.now() + 1,
            },
          ],
        }),
      ),
      container,
    );

    const iframe = container.querySelector<HTMLIFrameElement>(".chat-tool-card__preview-frame");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
  });

  it("renders assistant_message canvas results in the assistant bubble even when tool rows are visible", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: true,
          autoExpandToolCalls: true,
          messages: [
            {
              id: "assistant-canvas-inline-visible",
              role: "assistant",
              content: [{ type: "text", text: "Inline canvas result." }],
              timestamp: Date.now(),
            },
          ],
          toolMessages: [
            {
              id: "tool-artifact-inline-visible",
              role: "tool",
              toolCallId: "call-artifact-inline-visible",
              toolName: "canvas_render",
              content: JSON.stringify({
                kind: "canvas",
                view: {
                  backend: "canvas",
                  id: "cv_inline_visible",
                  url: "/__openclaw__/canvas/documents/cv_inline_visible/index.html",
                  title: "Inline demo",
                  preferred_height: 360,
                },
                presentation: {
                  target: "assistant_message",
                },
              }),
              timestamp: Date.now() + 1,
            },
          ],
        }),
      ),
      container,
    );

    const assistantBubble = container.querySelector(".chat-group.assistant .chat-bubble");
    const allPreviews = container.querySelectorAll(".chat-tool-card__preview-frame");
    expect(allPreviews).toHaveLength(1);
    expect(assistantBubble?.querySelector(".chat-tool-card__preview-frame")).not.toBeNull();
    expect(container.textContent).toContain("Tool output");
    expect(container.textContent).toContain("canvas_render");
    expect(container.textContent).toContain("Inline canvas result.");
    expect(container.textContent).toContain("Inline demo");
  });

  it("keeps lifted canvas previews attached to the nearest assistant turn", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: true,
          messages: [
            {
              id: "assistant-with-canvas",
              role: "assistant",
              content: [{ type: "text", text: "First reply." }],
              timestamp: 1_000,
            },
            {
              id: "assistant-without-canvas",
              role: "assistant",
              content: [{ type: "text", text: "Later unrelated reply." }],
              timestamp: 2_000,
            },
          ],
          toolMessages: [
            {
              id: "tool-canvas-for-first-reply",
              role: "tool",
              toolCallId: "call-canvas-old",
              toolName: "canvas_render",
              content: JSON.stringify({
                kind: "canvas",
                view: {
                  backend: "canvas",
                  id: "cv_nearest_turn",
                  url: "/__openclaw__/canvas/documents/cv_nearest_turn/index.html",
                  title: "Nearest turn demo",
                  preferred_height: 320,
                },
                presentation: {
                  target: "assistant_message",
                },
              }),
              timestamp: 1_001,
            },
          ],
        }),
      ),
      container,
    );

    const assistantBubbles = Array.from(
      container.querySelectorAll<HTMLElement>(".chat-group.assistant .chat-bubble"),
    );
    expect(assistantBubbles).toHaveLength(2);
    expect(assistantBubbles[0]?.querySelector(".chat-tool-card__preview-frame")).not.toBeNull();
    expect(assistantBubbles[1]?.querySelector(".chat-tool-card__preview-frame")).toBeNull();
    expect(assistantBubbles[1]?.textContent).toContain("Later unrelated reply.");
  });

  it("does not auto-render generic view handles from non-canvas payloads", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: true,
          messages: [
            {
              id: "assistant-generic-inline",
              role: "assistant",
              content: [{ type: "text", text: "Rendered the item inline." }],
              timestamp: Date.now(),
            },
          ],
          toolMessages: [
            {
              id: "tool-generic-inline",
              role: "tool",
              toolCallId: "call-generic-inline",
              toolName: "plugin_card_details",
              content: JSON.stringify({
                selected_item: {
                  summary: {
                    label: "Alpha",
                    meaning: "Generic example",
                  },
                  view: {
                    backend: "canvas",
                    id: "cv_generic_inline",
                    url: "/__openclaw__/canvas/documents/cv_generic_inline/index.html",
                    title: "Inline generic preview",
                    preferred_height: 420,
                  },
                },
              }),
              timestamp: Date.now() + 1,
            },
          ],
        }),
      ),
      container,
    );

    const assistantBubble = container.querySelector(".chat-group.assistant .chat-bubble");
    const allPreviews = container.querySelectorAll(".chat-tool-card__preview-frame");
    expect(allPreviews).toHaveLength(0);
    expect(assistantBubble?.querySelector(".chat-tool-card__preview-frame")).toBeNull();
    expect(container.textContent).toContain("Tool output");
    expect(container.textContent).toContain("plugin_card_details");
    expect(container.textContent).toContain("Rendered the item inline.");
    expect(container.textContent).not.toContain("Inline generic preview");
  });

  it("renders assistant MEDIA attachments, voice-note badge, and reply pill", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          messages: [
            {
              id: "assistant-media-inline",
              role: "assistant",
              content:
                "[[reply_to_current]]Here is the image.\nMEDIA:https://example.com/photo.png\nMEDIA:https://example.com/voice.ogg\n[[audio_as_voice]]",
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-reply-pill")?.textContent).toContain(
      "Replying to current message",
    );
    expect(container.querySelector(".chat-message-image")).not.toBeNull();
    expect(container.querySelector("audio")).not.toBeNull();
    expect(container.querySelector(".chat-assistant-attachment-badge")?.textContent).toContain(
      "Voice note",
    );
    expect(container.textContent).toContain("Here is the image.");
    expect(container.textContent).not.toContain("[[reply_to_current]]");
    expect(container.textContent).not.toContain("[[audio_as_voice]]");
    expect(container.textContent).not.toContain("MEDIA:https://example.com/photo.png");
  });

  it("renders verified local assistant attachments through the Control UI media route", async () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("meta=1")) {
        return {
          ok: true,
          json: async () => ({ available: true }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const container = document.createElement("div");
    const template = () =>
      renderChat(
        createProps({
          showToolCalls: false,
          basePath: "/openclaw",
          assistantAttachmentAuthToken: "session-token",
          localMediaPreviewRoots: ["/tmp/openclaw"],
          onRequestUpdate: () => render(template(), container),
          messages: [
            {
              id: "assistant-local-media-inline",
              role: "assistant",
              content:
                "Local image\nMEDIA:/tmp/openclaw/test image.png\nMEDIA:/tmp/openclaw/test-doc.pdf",
              timestamp: Date.now(),
            },
          ],
        }),
      );

    render(template(), container);
    expect(container.textContent).toContain("Checking...");
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "/openclaw/__openclaw__/assistant-media?source=%2Ftmp%2Fopenclaw%2Ftest+image.png&token=session-token&meta=1",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );

    const image = container.querySelector<HTMLImageElement>(".chat-message-image");
    const docLink = container.querySelector<HTMLAnchorElement>(
      ".chat-assistant-attachment-card__link",
    );
    expect(image?.getAttribute("src")).toBe(
      "/openclaw/__openclaw__/assistant-media?source=%2Ftmp%2Fopenclaw%2Ftest+image.png&token=session-token",
    );
    expect(docLink?.getAttribute("href")).toBe(
      "/openclaw/__openclaw__/assistant-media?source=%2Ftmp%2Fopenclaw%2Ftest-doc.pdf&token=session-token",
    );
    expect(container.textContent).not.toContain("test image.png");
    vi.unstubAllGlobals();
  });

  it("rechecks local assistant attachment availability when the auth token changes", async () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes("meta=1")) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return {
        ok: true,
        json: async () => ({ available: url.includes("token=fresh-token") }),
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const container = document.createElement("div");

    const renderWithToken = (token: string | null) =>
      render(
        renderChat(
          createProps({
            showToolCalls: false,
            basePath: "/openclaw",
            assistantAttachmentAuthToken: token,
            localMediaPreviewRoots: ["/tmp/openclaw"],
            onRequestUpdate: () => renderWithToken(token),
            messages: [
              {
                id: "assistant-local-media-auth-refresh",
                role: "assistant",
                content: "Local image\nMEDIA:/tmp/openclaw/test image.png",
                timestamp: Date.now(),
              },
            ],
          }),
        ),
        container,
      );

    renderWithToken(null);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toContain("Unavailable");

    renderWithToken("fresh-token");
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/openclaw/__openclaw__/assistant-media?source=%2Ftmp%2Fopenclaw%2Ftest+image.png&meta=1",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/openclaw/__openclaw__/assistant-media?source=%2Ftmp%2Fopenclaw%2Ftest+image.png&token=fresh-token&meta=1",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
    expect(container.querySelector(".chat-message-image")).not.toBeNull();
    expect(container.textContent).not.toContain("Unavailable");
    vi.unstubAllGlobals();
  });

  it("preserves same-origin assistant attachments without local preview rewriting", () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          basePath: "/openclaw",
          localMediaPreviewRoots: ["/tmp/openclaw"],
          messages: [
            {
              id: "assistant-same-origin-media-inline",
              role: "assistant",
              content:
                "Inline\nMEDIA:/media/inbound/test-image.png\nMEDIA:/__openclaw__/media/test-doc.pdf",
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    const image = container.querySelector<HTMLImageElement>(".chat-message-image");
    const docLink = container.querySelector<HTMLAnchorElement>(
      ".chat-assistant-attachment-card__link",
    );
    expect(image?.getAttribute("src")).toBe("/media/inbound/test-image.png");
    expect(docLink?.getAttribute("href")).toBe("/__openclaw__/media/test-doc.pdf");
    expect(container.textContent).not.toContain("Unavailable");
  });

  it("renders blocked local assistant files as unavailable with a reason", () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          basePath: "/openclaw",
          localMediaPreviewRoots: ["/tmp/openclaw"],
          messages: [
            {
              id: "assistant-blocked-local-media",
              role: "assistant",
              content: "Blocked\nMEDIA:/Users/test/Documents/private.pdf\nDone",
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-assistant-attachment-card__link")).toBeNull();
    expect(container.textContent).toContain("private.pdf");
    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).toContain("Outside allowed folders");
    expect(container.textContent).toContain("Blocked");
    expect(container.textContent).toContain("Done");
  });

  it("allows Windows file URLs inside allowed preview roots", async () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes("meta=1")) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return {
        ok: true,
        json: async () => ({ available: true }),
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          basePath: "/openclaw",
          localMediaPreviewRoots: ["C:\\tmp\\openclaw"],
          onRequestUpdate: () => undefined,
          messages: [
            {
              id: "assistant-windows-file-url",
              role: "assistant",
              content: "Windows image\nMEDIA:file:///C:/tmp/openclaw/test%20image.png",
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "/openclaw/__openclaw__/assistant-media?source=%2FC%3A%2Ftmp%2Fopenclaw%2Ftest%2520image.png&meta=1",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
    expect(container.textContent).not.toContain("Outside allowed folders");
    vi.unstubAllGlobals();
  });

  it("allows Windows local assistant attachments when path casing differs", async () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes("meta=1")) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return {
        ok: true,
        json: async () => ({ available: true }),
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          basePath: "/openclaw",
          localMediaPreviewRoots: ["c:\\users\\test\\pictures"],
          onRequestUpdate: () => undefined,
          messages: [
            {
              id: "assistant-windows-path-case-differs",
              role: "assistant",
              content: "Windows image\nMEDIA:C:\\Users\\Test\\Pictures\\test image.png",
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "/openclaw/__openclaw__/assistant-media?source=C%3A%5CUsers%5CTest%5CPictures%5Ctest+image.png&meta=1",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
    expect(container.textContent).not.toContain("Outside allowed folders");
    vi.unstubAllGlobals();
  });

  it("revalidates cached unavailable local assistant attachments after retry window", async () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<(url: string) => Promise<{ ok: true; json: () => Promise<{ available: boolean }> }>>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: true }),
      });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const container = document.createElement("div");

    const renderMessage = () =>
      render(
        renderChat(
          createProps({
            showToolCalls: false,
            basePath: "/openclaw",
            localMediaPreviewRoots: ["/tmp/openclaw"],
            onRequestUpdate: renderMessage,
            messages: [
              {
                id: "assistant-local-media-retry-after-unavailable",
                role: "assistant",
                content: "Local image\nMEDIA:/tmp/openclaw/test image.png",
                timestamp: Date.now(),
              },
            ],
          }),
        ),
        container,
      );

    renderMessage();
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Unavailable");

    vi.advanceTimersByTime(5_001);
    renderMessage();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".chat-message-image")).not.toBeNull();
    expect(container.textContent).not.toContain("Unavailable");

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("allows tilde local assistant attachments inside home-based preview roots", async () => {
    resetAssistantAttachmentAvailabilityCacheForTest();
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes("meta=1")) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return {
        ok: true,
        json: async () => ({ available: true }),
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: false,
          basePath: "/openclaw",
          localMediaPreviewRoots: ["/Users/test/Pictures"],
          onRequestUpdate: () => undefined,
          messages: [
            normalizeMessage({
              id: "assistant-tilde-local-media",
              role: "assistant",
              content: [
                { type: "text", text: "Home image" },
                {
                  type: "attachment",
                  attachment: {
                    url: "~/Pictures/test image.png",
                    kind: "image",
                    label: "test image.png",
                    mimeType: "image/png",
                  },
                },
              ],
              timestamp: Date.now(),
            }),
          ],
        }),
      ),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "/openclaw/__openclaw__/assistant-media?source=%7E%2FPictures%2Ftest+image.png&meta=1",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
    expect(container.textContent).not.toContain("Outside allowed folders");
    vi.unstubAllGlobals();
  });

  it("routes inline canvas blocks through the scoped canvas host when available", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          canvasHostUrl: "http://127.0.0.1:19003/__openclaw__/cap/cap_123",
          messages: [
            {
              id: "assistant-scoped-canvas",
              role: "assistant",
              content: [
                { type: "text", text: "Rendered inline." },
                {
                  type: "canvas",
                  preview: {
                    kind: "canvas",
                    surface: "assistant_message",
                    render: "url",
                    viewId: "cv_inline_scoped",
                    title: "Scoped preview",
                    url: "/__openclaw__/canvas/documents/cv_inline_scoped/index.html",
                    preferredHeight: 320,
                  },
                },
              ],
              timestamp: Date.now(),
            },
          ],
        }),
      ),
      container,
    );

    const iframe = container.querySelector(".chat-tool-card__preview-frame");
    expect(iframe?.getAttribute("src")).toBe(
      "http://127.0.0.1:19003/__openclaw__/cap/cap_123/__openclaw__/canvas/documents/cv_inline_scoped/index.html",
    );
  });

  it("renders server-history canvas blocks for the live toolResult sequence after history reload", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: true,
          messages: [
            {
              id: "assistant-toolcall-live-shape",
              role: "assistant",
              content: [
                { type: "thinking", thinking: "", thinkingSignature: "sig-1" },
                {
                  type: "toolCall",
                  id: "call_live_canvas",
                  name: "canvas_tool_result",
                  arguments: {},
                  partialJson: "{}",
                },
              ],
              timestamp: Date.now(),
            },
            {
              id: "toolresult-live-shape",
              role: "toolResult",
              toolCallId: "call_live_canvas",
              toolName: "canvas_tool_result",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    kind: "canvas",
                    view: {
                      backend: "canvas",
                      id: "cv_canvas_live_history",
                      url: "/__openclaw__/canvas/documents/cv_canvas_live_history/index.html",
                      title: "Live history preview",
                      preferred_height: 420,
                    },
                    presentation: {
                      target: "assistant_message",
                    },
                  }),
                },
              ],
              timestamp: Date.now() + 1,
            },
            {
              id: "assistant-final-live-shape",
              role: "assistant",
              content: [
                { type: "thinking", thinking: "", thinkingSignature: "sig-2" },
                { type: "text", text: "This item is ready." },
                {
                  type: "canvas",
                  preview: {
                    kind: "canvas",
                    surface: "assistant_message",
                    render: "url",
                    viewId: "cv_canvas_live_history",
                    title: "Live history preview",
                    url: "/__openclaw__/canvas/documents/cv_canvas_live_history/index.html",
                    preferredHeight: 420,
                  },
                  rawText: JSON.stringify({
                    kind: "canvas",
                    view: {
                      backend: "canvas",
                      id: "cv_canvas_live_history",
                      url: "/__openclaw__/canvas/documents/cv_canvas_live_history/index.html",
                    },
                    presentation: {
                      target: "assistant_message",
                    },
                  }),
                },
              ],
              timestamp: Date.now() + 2,
            },
          ],
          toolMessages: [],
        }),
      ),
      container,
    );

    const assistantBubbles = container.querySelectorAll(".chat-group.assistant .chat-bubble");
    const finalAssistantBubble = assistantBubbles[assistantBubbles.length - 1];
    const allPreviews = container.querySelectorAll(".chat-tool-card__preview-frame");
    expect(allPreviews).toHaveLength(1);
    expect(finalAssistantBubble?.querySelector(".chat-tool-card__preview-frame")).not.toBeNull();
    expect(finalAssistantBubble?.textContent).toContain("This item is ready.");
    expect(finalAssistantBubble?.textContent).toContain("Live history preview");
  });

  it("lifts streamed canvas tool messages with toolresult blocks into the assistant bubble", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          showToolCalls: true,
          messages: [
            {
              id: "assistant-streamed-artifact",
              role: "assistant",
              content: [{ type: "text", text: "Done." }],
              timestamp: Date.now(),
            },
          ],
          toolMessages: [
            {
              id: "tool-streamed-artifact",
              role: "assistant",
              toolCallId: "call_streamed_artifact",
              timestamp: Date.now() - 1,
              content: [
                {
                  type: "toolcall",
                  name: "canvas_render",
                  arguments: { source: { type: "handle", id: "cv_streamed_artifact" } },
                },
                {
                  type: "toolresult",
                  name: "canvas_render",
                  text: JSON.stringify({
                    kind: "canvas",
                    view: {
                      backend: "canvas",
                      id: "cv_streamed_artifact",
                      url: "/__openclaw__/canvas/documents/cv_streamed_artifact/index.html",
                      title: "Streamed demo",
                      preferred_height: 320,
                    },
                    presentation: {
                      target: "assistant_message",
                    },
                  }),
                },
              ],
            },
          ],
        }),
      ),
      container,
    );

    const assistantBubble = container.querySelector(".chat-group.assistant .chat-bubble");
    expect(assistantBubble?.querySelector(".chat-tool-card__preview-frame")).not.toBeNull();
    expect(container.textContent).toContain("Streamed demo");
    expect(container.textContent).toContain("Done.");
    expect(
      Array.from(container.querySelectorAll(".chat-tool-msg-summary__label")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toContain("Tool output");
  });

  it("opens generic tool details instead of a canvas preview from tool rows", async () => {
    const container = document.createElement("div");
    const onOpenSidebar = vi.fn();
    render(
      renderChat(
        createProps({
          showToolCalls: true,
          autoExpandToolCalls: true,
          onOpenSidebar,
          messages: [
            {
              id: "assistant-canvas-sidebar",
              role: "assistant",
              content: [{ type: "text", text: "Sidebar canvas result." }],
              timestamp: Date.now(),
            },
          ],
          toolMessages: [
            {
              id: "tool-artifact-sidebar",
              role: "tool",
              toolCallId: "call-artifact-sidebar",
              toolName: "canvas_render",
              content: JSON.stringify({
                kind: "canvas",
                view: {
                  backend: "canvas",
                  id: "cv_sidebar",
                  url: "https://example.com/canvas",
                  title: "Sidebar demo",
                  preferred_height: 420,
                },
                presentation: {
                  target: "tool_card",
                },
              }),
              timestamp: Date.now() + 1,
            },
          ],
        }),
      ),
      container,
    );

    await Promise.resolve();

    const sidebarButton = container.querySelector<HTMLButtonElement>(".chat-tool-card__action-btn");

    sidebarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(container.querySelector(".chat-tool-card__preview-frame")).toBeNull();
    expect(sidebarButton).not.toBeNull();
    expect(onOpenSidebar).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "markdown",
      }),
    );
  });

  it("lets a split tool call collapse even when a separate tool output shares its toolCallId", async () => {
    const container = document.createElement("div");
    const props = createProps({
      autoExpandToolCalls: true,
      messages: [
        {
          id: "assistant-6",
          role: "assistant",
          toolCallId: "call-6",
          content: [
            {
              type: "toolcall",
              id: "call-6",
              name: "sessions_spawn",
              arguments: { mode: "session", thread: true },
            },
          ],
          timestamp: Date.now(),
        },
        {
          id: "tool-6",
          role: "tool",
          toolCallId: "call-6",
          toolName: "sessions_spawn",
          content: JSON.stringify({ status: "error" }, null, 2),
          timestamp: Date.now() + 1,
        },
      ],
    });

    const rerender = () => {
      render(renderChat({ ...props, onRequestUpdate: rerender }), container);
    };
    rerender();

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain('"thread": true');
    expect(container.textContent).toContain('"status": "error"');

    const summaries = container.querySelectorAll<HTMLElement>(".chat-tool-msg-summary");
    summaries[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTasks();

    expect(container.textContent).not.toContain("Tool input");
    expect(container.textContent).toContain('"status": "error"');
  });

  it("renders skill candidates from decision briefs instead of raw planning packets", () => {
    const container = document.createElement("div");
    const skillCandidate = {
      skillCandidateId: "skill-candidate-brief",
      proactivityOpportunityId: "opportunity-brief",
      normalizedIntentKey: "first bounded draft package should include only what is",
      sourceRuntime: "openclaw_session" as const,
      candidateType: "explicit_skill_request" as const,
      evidenceSummary: "Repeated bounded draft-package scoping work.",
      recurrenceCount: 2,
      recurrenceWindow: {
        firstSeenAt: "2026-04-28T00:00:00.000Z",
        lastSeenAt: "2026-04-28T00:10:00.000Z",
      },
      exampleHashes: ["example-hash"],
      suggestedSkillName: "first bounded draft package should include only what is",
      riskTier: "low" as const,
      autonomyLevelCeiling: 1 as const,
      lifecycleStatus: "detected" as const,
      installTargets: ["workspace_skills_dir"],
      evalStatus: "not_started" as const,
      vettingStatus: "not_started" as const,
      canaryStatus: "not_started" as const,
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:10:00.000Z",
      provenanceRefs: ["chat://main/assistant_turn/msg_bad_skill_card"],
      rollbackPlan: {
        rollbackId: "rollback-brief",
        strategy: "disable_candidate_only" as const,
        targetPaths: ["workspace_skills_dir"],
        directMainMutationAllowed: false as const,
      },
    };
    const userFacingBrief = {
      title: "New skill: draft-skill-package-checklist",
      kindLabel: "New skill" as const,
      oneLinePurpose:
        "Define what belongs in the first bounded Skillifier draft package before any install or promotion.",
      recommendedNextStep: "Next step: Draft the skill contract and routing or workflow checks.",
      primaryActionLabel: "Draft skill package",
      statusLabel: "detected",
      detailSummary: "Candidate evidence and why-surfaced diagnostics are available in details.",
      skillPresentationKind: "new_skill_candidate" as const,
      hiddenDiagnostics: {
        whyNow:
          "The user explicitly asked for skill-oriented reuse and recent OpenClaw work produced a bounded example.",
        evidenceSummary: "Bounded skillifier draft evidence.",
        provenanceRefs: ["chat://main/assistant_turn/msg_bad_skill_card"],
        limitations: ["source_title_was_transformation_instruction"],
        sourceRefs: ["chat://main/assistant_turn/msg_bad_skill_card"],
      },
      quality: { status: "pass" as const, reasons: [] },
    };
    const queueItem: ProductProactivityQueueItem = {
      queueItemId: "queue-brief",
      candidateId: "candidate-brief",
      skillCandidate,
      opportunityId: "opportunity-brief",
      opportunityClass: "skill_candidate",
      opportunityStatus: "surfaced",
      workItemId: "work-brief",
      workItemKind: "planning_request",
      workItemStatus: "not_started",
      primaryAction: {
        actionType: "draft_skill_package",
        label: "Draft skill package",
        description: "Creates a bounded review-only skill draft.",
        requiresChatInject: false,
        executesAction: false,
      },
      secondaryActions: [],
      ctaExplanation: "Creates a bounded review-only skill draft.",
      handoffStatus: "idle",
      handoffError: null,
      handoffMessageAnchor: null,
      messageClass: "operator_approved_suggestion_available",
      boundedDisplayText: "Build the bounded request with:.",
      candidateSummary:
        "Already recurring: multiple draft artifacts cluster around the same idea:.",
      planTitle: "It sets the default packaging strategy for every future",
      problem:
        "The user explicitly asked for skill-oriented reuse and recent OpenClaw work already produced a concrete bounded example.",
      proposedMessage: "It sets the default packaging strategy for every future draft.",
      suggestedAction: "Draft a bounded skill package.",
      expectedUserValue: "Reduce repeated Skillifier draft-scoping work.",
      userBenefit: "Reduce repeated Skillifier draft-scoping work.",
      evidenceSummary: "Bounded skillifier draft evidence.",
      confidence: "high",
      blockedIfMissing: [],
      userFacingBrief,
      status: "pending_review",
      layer: "actionable",
      attentionRequired: true,
      sendStatus: "idle",
      sendError: null,
      sentMessageAnchor: null,
      eligibleScope: {
        environment: "live",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator",
        allowedMessageClasses: ["operator_approved_suggestion_available"],
        proofPrerequisiteIds: [],
        proofPrerequisiteHashes: [],
      },
      sourceRefs: ["chat://main/assistant_turn/msg_bad_skill_card"],
      sourceProfileIds: ["tool_result_capture"],
      authorityTiers: ["tool_grounded"],
      contentHashes: ["content-hash-brief"],
      proofHashes: ["proof-hash-brief"],
      noDarkDataStatus: "pass",
      staleLabels: [],
      conflictLabels: [],
      blockedReasonCodes: [],
      generatedAt: "2026-04-28T00:10:00.000Z",
      updatedAt: "2026-04-28T00:10:00.000Z",
    };
    const inboxItem: ProactivityInboxItem = {
      ...queueItem,
      itemId: "inbox-brief",
      sourceArtifactReportId: "report-brief",
      status: "pending_review",
      filterTags: ["actionable", "pending"],
      feedbackSummary: {
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        tooRepetitiveCount: 0,
        wrongContextCount: 0,
        unsafePrivateCount: 0,
      },
      whyThisAppearedSummary: "Generated from bounded skill-candidate evidence.",
    };

    render(
      renderChat(
        createProps({
          sessionKey: "main",
          sidebarOpen: true,
          sidebarContent: { kind: "proactivityInbox" },
          onCloseSidebar: () => undefined,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Turn the recurring workflow into the smallest bounded reusable skill concept.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_bad_skill_card",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-28T00:10:00.000Z"),
            },
          ],
          productProactivityQueue: [queueItem],
          proactivityInboxDigest: {
            digestId: "digest-brief",
            generatedAt: "2026-04-28T00:10:00.000Z",
            filters: [
              "actionable",
              "pending",
              "planned",
              "sent",
              "snoozed",
              "dismissed",
              "blocked",
              "autosend_trial",
              "diagnostics",
            ],
            counts: {
              actionable: 1,
              pending: 1,
              planned: 0,
              sent: 0,
              snoozed: 0,
              dismissed: 0,
              blocked: 0,
              autosend_trial: 0,
              diagnostics: 0,
            },
            layerCounts: { actionable: 1, history: 0, diagnostic: 0 },
            items: [inboxItem],
          },
        }),
      ),
      container,
    );

    const inlineCard = container.querySelector(".inline-proactivity-card__item");
    expect(inlineCard?.textContent).toContain("New Skill: Draft Skill Package Checklist");
    expect(inlineCard?.textContent).toContain("Define what belongs");
    expect(inlineCard?.textContent).toContain("Next step");
    expect(inlineCard?.textContent).toContain("Draft the skill contract");
    expect(inlineCard?.textContent).toContain("Why surfaced");
    expect(inlineCard?.textContent).not.toContain("Why now");
    expect(inlineCard?.textContent).not.toContain("Skill worth creating");
    expect(inlineCard?.textContent).not.toContain("Turn Turn");
    expect(inlineCard?.textContent).not.toContain("Already recurring");
    expect(inlineCard?.textContent).not.toContain("Build the bounded request with");
    expect(inlineCard?.textContent).not.toContain("It sets the default packaging strategy");

    const inboxItemElement = container.querySelector(".proactivity-inbox__item");
    expect(inboxItemElement?.textContent).toContain("New Skill: Draft Skill Package Checklist");
    expect(inboxItemElement?.textContent).toContain("Purpose");
    expect(inboxItemElement?.textContent).not.toContain("Skill worth creating");
    expect(inboxItemElement?.textContent).not.toContain("Turn Turn");
    expect(inboxItemElement?.textContent).not.toContain("Already recurring");
    expect(inboxItemElement?.textContent).not.toContain("Build the bounded request with");
    expect(inboxItemElement?.textContent).not.toContain("It sets the default packaging strategy");
  });

  it("lets a tool call collapse when the matching tool output comes from toolMessages", async () => {
    const container = document.createElement("div");
    const props = createProps({
      autoExpandToolCalls: true,
      messages: [
        {
          id: "assistant-7",
          role: "assistant",
          toolCallId: "call-7",
          content: [
            {
              type: "toolcall",
              id: "call-7",
              name: "sessions_spawn",
              arguments: { mode: "session", thread: true },
            },
          ],
          timestamp: Date.now(),
        },
      ],
      toolMessages: [
        {
          id: "tool-7",
          role: "tool",
          toolCallId: "call-7",
          toolName: "sessions_spawn",
          content: JSON.stringify({ status: "error" }, null, 2),
          timestamp: Date.now() + 1,
        },
      ],
    });

    const rerender = () => {
      render(renderChat({ ...props, onRequestUpdate: rerender }), container);
    };
    rerender();

    expect(container.textContent).toContain("Tool input");
    expect(container.textContent).toContain('"thread": true');
    expect(container.textContent).toContain('"status": "error"');

    const summaries = container.querySelectorAll<HTMLElement>(".chat-tool-msg-summary");
    expect(summaries.length).toBeGreaterThan(1);
    summaries[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTasks();

    expect(container.textContent).not.toContain("Tool input");
    expect(container.textContent).toContain('"status": "error"');
  });
});
