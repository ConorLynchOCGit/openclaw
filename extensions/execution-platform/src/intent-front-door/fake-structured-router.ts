import { createHash } from "node:crypto";
import type { ConversationRoutingContext } from "./conversation-routing-context.ts";
import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  createBaseCanonicalRouterOutput,
  parseCanonicalRouterOutput,
  type CanonicalRouterOutput,
} from "./router-schema.ts";
import type { WorkflowSummaryIndex } from "./workflow-summary-index.ts";

export type FakeStructuredRouterFixture = {
  fixtureId: string;
  output: CanonicalRouterOutput;
};

export type FakeStructuredRouterInput = {
  fixtureId?: string;
  promptHash?: string;
  exactPromptFixtureKey?: string;
  promptSummary?: string;
  workflowSummaryIndex?: WorkflowSummaryIndex;
  conversationContext?: ConversationRoutingContext;
};

export type FakeStructuredRouterResult = {
  output: CanonicalRouterOutput;
  metadata: {
    routerKind: "fixture_structured_router";
    promptHash: string;
    promptSummary: string;
    schemaVersion: typeof CANONICAL_ROUTER_SCHEMA_VERSION;
    workflowRegistryVersion: string | null;
    reasonCodes: string[];
    rawPromptStored: false;
    rawResponseStored: false;
    providerCalled: false;
    runtimeJobCreated: false;
    authorityGranted: false;
    workQueueLifecycleMutationAllowed: false;
  };
};

function hashFixtureKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedSummary(value: string | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim().slice(0, 500);
}

export class FixtureStructuredIntentRouterProvider {
  readonly fixtures = new Map<string, CanonicalRouterOutput>();

  constructor(fixtures: FakeStructuredRouterFixture[] = []) {
    for (const fixture of fixtures) {
      this.registerFixture(fixture.fixtureId, fixture.output);
    }
  }

  registerFixture(fixtureId: string, output: CanonicalRouterOutput): void {
    const parsed = parseCanonicalRouterOutput(output);
    if (!parsed.valid || !parsed.output) {
      throw new Error(`invalid fake router fixture: ${parsed.reasonCodes.join(",")}`);
    }
    this.fixtures.set(fixtureId, parsed.output);
  }

  async route(input: FakeStructuredRouterInput): Promise<FakeStructuredRouterResult> {
    const lookupKeys = [input.fixtureId, input.promptHash, input.exactPromptFixtureKey].filter(
      (key): key is string => Boolean(key),
    );
    const output =
      lookupKeys.flatMap((key) => {
        const fixture = this.fixtures.get(key);
        return fixture ? [fixture] : [];
      })[0] ?? createUnknownFixtureOutput();
    const parsed = parseCanonicalRouterOutput(output);
    if (!parsed.valid || !parsed.output) {
      throw new Error(`fake router emitted invalid schema: ${parsed.reasonCodes.join(",")}`);
    }

    return {
      output: parsed.output,
      metadata: {
        routerKind: "fixture_structured_router",
        promptHash:
          input.promptHash ??
          hashFixtureKey(input.fixtureId ?? input.exactPromptFixtureKey ?? "unknown"),
        promptSummary: boundedSummary(input.promptSummary),
        schemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
        workflowRegistryVersion:
          input.workflowSummaryIndex?.workflowRegistryVersion ??
          input.conversationContext?.workflowRegistryVersion ??
          null,
        reasonCodes: [
          "fixture_structured_router_test_only",
          ...parsed.output.reasonCodes.slice(0, 12),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        providerCalled: false,
        runtimeJobCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutationAllowed: false,
      },
    };
  }
}

export function createUnknownFixtureOutput(): CanonicalRouterOutput {
  return createBaseCanonicalRouterOutput({
    route: "clarification_required",
    responseMode: "ask_clarification",
    confidence: 0,
    objectiveSummary: "No structured fixture matched this test route request.",
    ambiguity: {
      ambiguous: true,
      missingInputs: ["fixtureId"],
      conflictingInstructions: [],
      clarificationQuestion: "Which structured routing fixture should this test use?",
    },
    reasonCodes: ["unknown_fixture_requires_clarification"],
  });
}

export function createFixtureRouterWithDefaultCases(): FixtureStructuredIntentRouterProvider {
  return new FixtureStructuredIntentRouterProvider([
    {
      fixtureId: "chat",
      output: createBaseCanonicalRouterOutput({
        route: "chat_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
        objectiveSummary: "Answer directly in chat.",
        reasonCodes: ["fixture_chat_response"],
      }),
    },
    {
      fixtureId: "status",
      output: createBaseCanonicalRouterOutput({
        route: "status_response",
        responseMode: "answer_in_chat",
        confidence: 0.98,
        objectiveSummary: "Return bounded status readback.",
        requestedActions: [
          { action: "status", objectSummary: "status readback", confidence: 0.98 },
        ],
        reasonCodes: ["fixture_status_response"],
      }),
    },
    {
      fixtureId: "plan",
      output: createBaseCanonicalRouterOutput({
        route: "plan_only",
        responseMode: "create_plan_only",
        confidence: 0.91,
        objectiveSummary: "Create a bounded plan without execution.",
        requestedActions: [{ action: "plan", objectSummary: "bounded plan", confidence: 0.91 }],
        reasonCodes: ["fixture_plan_only"],
      }),
    },
    {
      fixtureId: "coding",
      output: createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
        objectiveSummary: "Run the coding workflow through the generic workflow contract.",
        requestedActions: [
          { action: "code_edit", objectSummary: "bounded implementation", confidence: 0.95 },
          { action: "test", objectSummary: "focused validation", confidence: 0.95 },
          { action: "review", objectSummary: "result review", confidence: 0.95 },
          { action: "closeout", objectSummary: "bounded closeout", confidence: 0.95 },
        ],
        riskClass: "medium",
        sideEffectClass: "code_edit",
        reasonCodes: ["fixture_workflow_execution_coding"],
      }),
    },
    {
      fixtureId: "research",
      output: createBaseCanonicalRouterOutput({
        route: "research_only",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "single_agent.web_research",
        jobType: "executor.single_agent",
        confidence: 0.94,
        objectiveSummary: "Run bounded web research with citations only.",
        requestedActions: [
          { action: "research", objectSummary: "bounded research", confidence: 0.94 },
        ],
        requestedAuthority: "outbound_readonly",
        sideEffectClass: "outbound_readonly",
        reasonCodes: ["fixture_research_only"],
      }),
    },
    {
      fixtureId: "control",
      output: createBaseCanonicalRouterOutput({
        route: "work_queue_control",
        responseMode: "apply_control",
        confidence: 0.93,
        objectiveSummary: "Apply a server-backed Work Queue control after validation.",
        requestedActions: [
          {
            action: "work_queue_control",
            objectSummary: "runtime-backed control",
            confidence: 0.93,
          },
        ],
        targetRefs: [
          { targetKind: "runtime_job", targetRef: "runtime-job://fixture", confidence: 0.93 },
        ],
        reasonCodes: ["fixture_work_queue_control"],
      }),
    },
    {
      fixtureId: "blocked",
      output: createBaseCanonicalRouterOutput({
        route: "blocked",
        responseMode: "block",
        confidence: 0.99,
        objectiveSummary: "Block unsafe or unsupported request.",
        riskClass: "critical",
        sideEffectClass: "production_side_effect",
        reasonCodes: ["fixture_blocked"],
      }),
    },
    {
      fixtureId: "multi_research_then_code",
      output: createBaseCanonicalRouterOutput({
        route: "multi_workflow_plan",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.9,
        objectiveSummary: "Plan a child research handoff followed by coding workflow execution.",
        requestedActions: [
          { action: "research", objectSummary: "bounded child research", confidence: 0.9 },
          { action: "code_edit", objectSummary: "bounded implementation", confidence: 0.9 },
        ],
        childWorkflowRequests: [
          {
            childWorkflowId: "single_agent.web_research",
            requirement: "mandatory",
            reasonCodes: ["fixture_child_research_required"],
            requestedAuthority: "outbound_readonly",
            boundedInputSummary: "Bounded current-fact research request.",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        ],
        multiIntentPlan: [
          {
            order: 1,
            route: "research_only",
            workflowId: "single_agent.web_research",
            objectiveSummary: "Research bounded current facts.",
            dependsOnStep: null,
            authorityProfile: "outbound_readonly",
          },
          {
            order: 2,
            route: "workflow_execution",
            workflowId: "agent_team.coding",
            objectiveSummary: "Implement after bounded research handoff.",
            dependsOnStep: 1,
            authorityProfile: "local_yolo",
          },
        ],
        riskClass: "medium",
        sideEffectClass: "code_edit",
        reasonCodes: ["fixture_multi_workflow_plan"],
      }),
    },
  ]);
}
