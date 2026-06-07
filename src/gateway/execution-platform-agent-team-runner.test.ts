import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  NODE_EXECUTION_STORAGE_POLICY,
  type NodeExecutionRunRecord,
  type NodeExecutionSnapshot,
} from "../../extensions/execution-platform/runtime-api.js";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  buildNodeAgentBootstrapAdmissionFromSystemPromptReport,
  buildNodeExecutionRequiredSkillsSnapshot,
  prepareOpenClawNodeStart,
  resolveOpenClawNodeExecutionWorkspaceDir,
  resolveGatewayNodeAgentProfile,
  withWorkerPromptSessionProof,
} from "./execution-platform-agent-team-runner.js";

const REQUIRED_NODE_TOOL_ALLOW = [
  "node_finish",
  "openclaw_resource_read",
  "edit",
  "update_plan",
  "read_todo",
  "task",
];

function configForAgents(
  agents: NonNullable<NonNullable<OpenClawConfig["agents"]>["list"]>,
  tools?: OpenClawConfig["tools"],
): OpenClawConfig {
  return {
    ...(tools ? { tools } : {}),
    agents: {
      list: agents,
    },
  } as OpenClawConfig;
}

function makeNodeRun(agentId = "execution-coding"): NodeExecutionRunRecord {
  return {
    artifactKind: "execution_platform.node_execution_run_record",
    schemaVersion: "execution-platform.node-execution-run-record.v1",
    nodeRunId: "nrun_test",
    runtimeJobId: "job-test",
    graphId: "graph-test",
    nodeId: "impl-1",
    attemptId: "attempt-1",
    parentNodeRunId: null,
    agentId,
    sessionKey: `agent:${agentId}:node:nrun_test`,
    snapshotRef: "node-execution-snapshot://impl-1",
    finishArtifactRef: null,
    createdAt: "2026-06-05T00:00:00.000Z",
    startedAt: null,
    endedAt: null,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

function makeSnapshot(agentId = "execution-coding"): NodeExecutionSnapshot {
  return {
    artifactKind: "execution_platform.node_execution_snapshot",
    schemaVersion: "execution-platform.node-execution-snapshot.v1",
    snapshotRef: "node-execution-snapshot://impl-1",
    nodeRunId: "nrun_test",
    runtimeJobId: "job-test",
    workflowId: "agent_team.coding",
    graphId: "graph-test",
    nodeId: "impl-1",
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    attemptId: "attempt-1",
    agentId,
    sessionKey: `agent:${agentId}:node:nrun_test`,
    capabilityId: "source_edit",
    executionIntent: "source_edit",
    objective: "Implement the assigned source-edit requirement.",
    expectedOutput: "A validated source edit with node_finish evidence.",
    evidenceExpectation: "Return bounded evidence refs through node_finish.",
    acceptanceCriteria: ["The node can start a native OpenClaw agent session."],
    taskRefs: ["runtime-work-graph://node/impl-1"],
    requirementRefs: ["requirement://req-1"],
    sourcePromptRefs: ["source-prompt://proof/body/0-1200"],
    authorityRefs: {
      readableRepoRefs: [],
      writableRepoRefs: [],
      promptSourceRefs: ["source-prompt://proof/body/0-1200"],
      validationCommandRefs: [],
      deniedRefs: [],
      sandboxPolicyRef: null,
    },
    evidenceContractRef: null,
    validationPolicyRef: null,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
    replayMetadata: {
      graphSnapshotRef: "runtime-work-graph://graph/graph-test",
      nodeRef: "runtime-work-graph://node/impl-1",
      attemptRef: "runtime-work-graph://node-attempt/impl-1-attempt-1",
      source: "node_lifecycle_runner",
    },
  };
}

async function writeSkill(workspace: string, skill: string): Promise<void> {
  const skillDir = path.join(workspace, "skills", skill);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${skill}`,
      `description: ${skill} test skill instructions.`,
      "---",
      "",
      `# ${skill}`,
      "",
      `Follow the ${skill} workflow for this node session.`,
    ].join("\n"),
    "utf8",
  );
}

async function createAgentAssets(root: string, agentId: string): Promise<string> {
  const agentDir = path.join(root, "agents", agentId, "agent");
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(path.join(agentDir, "IDENTITY.md"), `# ${agentId}\n`, "utf8");
  return agentDir;
}

async function createExecutionConfig(
  input: {
    parentSkills?: string[];
    contextScoutSkills?: string[];
    validationScoutSkills?: string[];
    contextScoutTools?: string[];
    validationScoutTools?: string[];
    parentTools?: NonNullable<NonNullable<OpenClawConfig["agents"]>["list"]>[number]["tools"];
    parentSubagents?: string[];
    parentAgentDirOutsideWorkspace?: boolean;
    projectRootOutsideWorkspace?: boolean;
    createAssets?: boolean;
    globalTools?: OpenClawConfig["tools"];
  } = {},
): Promise<OpenClawConfig> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "execution-node-start-"));
  const skillRoot = input.projectRootOutsideWorkspace
    ? await fs.mkdtemp(path.join(os.tmpdir(), "execution-node-project-root-"))
    : workspace;
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "execution-node-start-outside-"));
  const createAssets = input.createAssets !== false;
  const parentAgentDir = input.parentAgentDirOutsideWorkspace
    ? path.join(outside, "agents", "execution-coding", "agent")
    : path.join(workspace, "agents", "execution-coding", "agent");
  if (createAssets) {
    await fs.mkdir(parentAgentDir, { recursive: true });
    await fs.writeFile(path.join(parentAgentDir, "IDENTITY.md"), "# execution-coding\n", "utf8");
    await createAgentAssets(workspace, "execution-context-scout");
    await createAgentAssets(workspace, "execution-validation-scout");
    await writeSkill(skillRoot, "execution-node-workflow");
    await writeSkill(skillRoot, "execution-context-scout");
    await writeSkill(skillRoot, "execution-validation-scout");
  }

  return configForAgents(
    [
      {
        id: "execution-coding",
        agentDir: parentAgentDir,
        workspace,
        ...(input.projectRootOutsideWorkspace ? { projectRoot: skillRoot } : {}),
        model: { primary: "openrouter/moonshotai/kimi-k2.6" },
        thinkingDefault: "xhigh",
        reasoningDefault: "stream",
        skills: input.parentSkills ?? ["execution-node-workflow"],
        tools: input.parentTools ?? {
          allow: REQUIRED_NODE_TOOL_ALLOW,
        },
        subagents: {
          allowAgents: input.parentSubagents ?? [
            "execution-context-scout",
            "execution-validation-scout",
          ],
          requireAgentId: true,
        },
      },
      {
        id: "execution-context-scout",
        agentDir: path.join(workspace, "agents", "execution-context-scout", "agent"),
        workspace,
        ...(input.projectRootOutsideWorkspace ? { projectRoot: skillRoot } : {}),
        skills: input.contextScoutSkills ?? ["execution-context-scout"],
        tools: {
          allow: input.contextScoutTools ?? ["read", "list", "glob", "grep"],
        },
      },
      {
        id: "execution-validation-scout",
        agentDir: path.join(workspace, "agents", "execution-validation-scout", "agent"),
        workspace,
        ...(input.projectRootOutsideWorkspace ? { projectRoot: skillRoot } : {}),
        skills: input.validationScoutSkills ?? ["execution-validation-scout"],
        tools: {
          allow: input.validationScoutTools ?? ["read", "list", "glob", "grep", "exec"],
        },
      },
    ],
    input.globalTools,
  );
}

function prepare(config: OpenClawConfig) {
  return prepareOpenClawNodeStart({
    config,
    nodeRun: makeNodeRun(),
    nodeExecutionSnapshot: makeSnapshot(),
    sessionFilePath: "/tmp/openclaw-node-start-test/session.jsonl",
  });
}

function stableTestHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeProviderAdmissionReport(
  overrides: Partial<SessionSystemPromptReport> = {},
): SessionSystemPromptReport {
  const base: SessionSystemPromptReport = {
    source: "run",
    generatedAt: 1,
    systemPrompt: {
      chars: 100,
      projectContextChars: 80,
      nonProjectContextChars: 20,
    },
    injectedWorkspaceFiles: [
      {
        name: "IDENTITY.md",
        path: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "AGENTS.md",
        path: "/root/.openclaw/agents/execution-coding/agent/AGENTS.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "BOOTSTRAP.md",
        path: "/root/.openclaw/agents/execution-coding/agent/BOOTSTRAP.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "TOOLS.md",
        path: "/root/.openclaw/agents/execution-coding/agent/TOOLS.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
    ],
    skills: {
      promptChars: 50,
      entries: [
        {
          name: "execution-node-workflow",
          blockChars: 50,
          location: "/root/.openclaw/workspace/skills/execution-node-workflow/SKILL.md",
          sourceRef: "openclaw-skill-file://execution-node-workflow",
          sourceHash: "skill-hash-1",
        },
      ],
    },
    tools: {
      listChars: 0,
      schemaChars: 0,
      entries: [],
    },
  };
  return {
    ...base,
    ...overrides,
  };
}

function makeWorkerPrompt(
  promptText = "Use update_plan, validate the change, and finish with node_finish.",
) {
  const promptHash = stableTestHash(promptText);
  return {
    promptRef: `node-agent-worker-prompt://nrun_test/${promptHash.slice(0, 20)}`,
    nodeRunId: "nrun_test",
    promptHash,
    promptByteCount: Buffer.byteLength(promptText, "utf8"),
    modelRunRef: "model-run://prompt/proof",
    promptText,
  };
}

describe("execution platform node agent start", () => {
  it("keeps profile resolution delegated to node start preparation", async () => {
    const result = await resolveGatewayNodeAgentProfile({
      config: { agents: { list: [] } } as OpenClawConfig,
      proposedAgentId: "missing-agent",
      requireAgentAssets: true,
    });

    expect(result).toMatchObject({
      status: "accepted",
      agentId: "missing-agent",
    });
    expect(result.reasonCodes).toContain(
      "node_agent_profile_resolution_delegated_to_node_start_adapter",
    );
  });

  it("blocks missing parent execution skill in the node-start receipt", async () => {
    const result = prepare(await createExecutionConfig({ parentSkills: ["other-skill"] }));

    expect(result).toMatchObject({
      status: "blocked",
      blockerKind: "node_agent_skill_missing",
      receipt: {
        status: "blocked",
        blockerKind: "node_agent_skill_missing",
      },
    });
    expect(result.receipt.missingSkills).toContainEqual({
      agentId: "execution-coding",
      skillName: "execution-node-workflow",
    });
  });

  it("blocks missing scout skill in the node-start receipt", async () => {
    const result = prepare(await createExecutionConfig({ contextScoutSkills: [] }));

    expect(result).toMatchObject({
      status: "blocked",
      blockerKind: "node_agent_skill_missing",
    });
    expect(result.receipt.missingSkills).toContainEqual({
      agentId: "execution-context-scout",
      skillName: "execution-context-scout",
    });
  });

  it("blocks missing scout discovery tools with native policy explanation", async () => {
    const result = prepare(
      await createExecutionConfig({ contextScoutTools: ["read", "list", "glob"] }),
    );

    expect(result).toMatchObject({
      status: "blocked",
      blockerKind: "node_agent_required_scout_tool_policy_insufficient",
    });
    expect(result.receipt.blockedTools).toContainEqual(
      expect.objectContaining({
        agentId: "execution-context-scout",
        toolName: "grep",
        allowed: false,
        blockedBy: ["agents.list[].tools"],
        effectiveProfileSource: "none",
        localPolicyExplicit: true,
      }),
    );
  });

  it("blocks mutating tools on scout agents to preserve native mode separation", async () => {
    const result = prepare(
      await createExecutionConfig({
        contextScoutTools: ["read", "list", "glob", "grep", "edit"],
        validationScoutTools: ["read", "list", "glob", "grep", "exec", "write"],
      }),
    );

    expect(result).toMatchObject({
      status: "blocked",
      blockerKind: "node_agent_required_scout_tool_policy_insufficient",
    });
    expect(result.receipt.blockedTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "execution-context-scout",
          toolName: "edit",
          allowed: false,
          blockedBy: expect.arrayContaining(["execution_node_scout_mode_separation"]),
        }),
        expect.objectContaining({
          agentId: "execution-validation-scout",
          toolName: "write",
          allowed: false,
          blockedBy: expect.arrayContaining(["execution_node_scout_mode_separation"]),
        }),
      ]),
    );
  });

  it("blocks missing native agent assets in the node-start receipt", async () => {
    const result = prepare(await createExecutionConfig({ createAssets: false }));

    expect(result).toMatchObject({
      status: "blocked",
      blockerKind: "node_agent_asset_missing",
    });
    expect(result.receipt.missingAssets.length).toBeGreaterThan(0);
  });

  it("accepts native OpenClaw agent dirs outside the coding workspace", async () => {
    const result = prepare(await createExecutionConfig({ parentAgentDirOutsideWorkspace: true }));

    expect(result.status).toBe("accepted");
    expect(result.receipt.workspaceFailure).toBeNull();
    expect(result.reasonCodes).not.toContain(
      "node_agent_runtime_agent_dir_outside_workspace:execution-coding",
    );
  });

  it("admits execution skills from projectRoot while runtime workspace remains separate", async () => {
    const result = prepare(await createExecutionConfig({ projectRootOutsideWorkspace: true }));

    expect(result.status).toBe("accepted");
    expect(result.receipt.missingAssets).toEqual([]);
    expect(result.reasonCodes).toContain("node_agent_start_native_openclaw_facts_accepted");
  });

  it("builds active required node skill context through the native skills snapshot surface", async () => {
    const config = await createExecutionConfig();
    const snapshot = buildNodeExecutionRequiredSkillsSnapshot({
      config,
      agentId: "execution-coding",
    });

    expect(snapshot.skillFilter).toEqual(["execution-node-workflow"]);
    expect(snapshot.skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "execution-node-workflow" })]),
    );
    expect(snapshot.prompt).toContain("<active_skills>");
    expect(snapshot.prompt).toContain('<active_skill name="execution-node-workflow"');
    expect(snapshot.prompt).toContain('source_ref="openclaw-skill-file://');
    expect(snapshot.prompt).toContain("source_hash=");
    expect(snapshot.prompt).toContain("Follow the execution-node-workflow workflow");
    expect(snapshot.prompt).not.toContain("<available_skills>");
    expect(snapshot.activeContextSources).toEqual([
      expect.objectContaining({
        kind: "required_skill",
        name: "execution-node-workflow",
        missing: false,
        truncated: false,
        sourceHash: expect.any(String),
      }),
    ]);
  });

  it("projects parent canonical docs and active required skills from the provider prompt report", () => {
    const report: SessionSystemPromptReport = {
      source: "run",
      generatedAt: 1,
      systemPrompt: {
        chars: 100,
        projectContextChars: 80,
        nonProjectContextChars: 20,
      },
      injectedWorkspaceFiles: [
        {
          name: "IDENTITY.md",
          path: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
        {
          name: "AGENTS.md",
          path: "/root/.openclaw/agents/execution-coding/agent/AGENTS.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
        {
          name: "BOOTSTRAP.md",
          path: "/root/.openclaw/agents/execution-coding/agent/BOOTSTRAP.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
        {
          name: "TOOLS.md",
          path: "/root/.openclaw/agents/execution-coding/agent/TOOLS.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
      ],
      skills: {
        promptChars: 50,
        entries: [
          {
            name: "execution-node-workflow",
            blockChars: 50,
            location: "/root/.openclaw/workspace/skills/execution-node-workflow/SKILL.md",
            sourceRef: "openclaw-skill-file://execution-node-workflow",
            sourceHash: "skill-hash-1",
          },
        ],
      },
      tools: {
        listChars: 0,
        schemaChars: 0,
        entries: [],
      },
    };

    const projection = buildNodeAgentBootstrapAdmissionFromSystemPromptReport({
      report,
      parentAgentId: "execution-coding",
      requiredSkillNames: ["execution-node-workflow"],
    });

    expect(projection.summary).toMatchObject({
      providerReportObserved: true,
      parentCanonicalDocsAdmitted: true,
      parentRequiredSkillsAdmitted: true,
      missingRequiredSources: [],
      truncatedRequiredSources: [],
    });
    expect(projection.canonicalAgentDocAdmissions).toHaveLength(4);
    expect(projection.requiredSkillContextAdmissions).toEqual([
      {
        agentId: "execution-coding",
        skillName: "execution-node-workflow",
        admitted: true,
        blockChars: 50,
        location: "/root/.openclaw/workspace/skills/execution-node-workflow/SKILL.md",
        sourceRef: "openclaw-skill-file://execution-node-workflow",
        sourceHash: "skill-hash-1",
      },
    ]);
    expect(projection.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_bootstrap_provider_report_observed",
        "node_agent_parent_canonical_docs_admitted_to_provider_context",
        "node_agent_parent_required_skills_admitted_to_provider_context",
      ]),
    );
  });

  it("surfaces missing or truncated bootstrap context from the provider prompt report", () => {
    const report: SessionSystemPromptReport = {
      source: "run",
      generatedAt: 1,
      systemPrompt: {
        chars: 100,
        projectContextChars: 80,
        nonProjectContextChars: 20,
      },
      injectedWorkspaceFiles: [
        {
          name: "IDENTITY.md",
          path: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
          missing: false,
          rawChars: 10,
          injectedChars: 5,
          truncated: true,
        },
      ],
      skills: {
        promptChars: 0,
        entries: [],
      },
      tools: {
        listChars: 0,
        schemaChars: 0,
        entries: [],
      },
    };

    const projection = buildNodeAgentBootstrapAdmissionFromSystemPromptReport({
      report,
      parentAgentId: "execution-coding",
      requiredSkillNames: ["execution-node-workflow"],
    });

    expect(projection.summary.parentCanonicalDocsAdmitted).toBe(false);
    expect(projection.summary.parentRequiredSkillsAdmitted).toBe(false);
    expect(projection.summary.missingRequiredSources).toEqual(
      expect.arrayContaining([
        "agent-doc:execution-coding:IDENTITY.md",
        "agent-doc:execution-coding:AGENTS.md",
        "agent-doc:execution-coding:BOOTSTRAP.md",
        "agent-doc:execution-coding:TOOLS.md",
        "skill:execution-coding:execution-node-workflow",
      ]),
    );
    expect(projection.summary.truncatedRequiredSources).toEqual([
      "agent-doc:execution-coding:IDENTITY.md",
    ]);
    expect(projection.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_parent_canonical_docs_missing_from_provider_context",
        "node_agent_parent_required_skills_missing_from_provider_context",
        "node_agent_bootstrap_required_sources_truncated",
      ]),
    );
  });

  it("accepts worker prompt session proof when provider bootstrap admission is complete", async () => {
    const start = prepare(await createExecutionConfig());
    expect(start.status).toBe("accepted");

    const receipt = withWorkerPromptSessionProof({
      receipt: start.receipt,
      workerPrompt: makeWorkerPrompt(),
      workerPromptArtifactRef: "runtime-job://job-test/node-worker-prompt/proof",
      sessionFilePath: "/tmp/openclaw-node-start-test/session.jsonl",
      systemPromptReport: makeProviderAdmissionReport(),
      effectiveToolNames: [
        "node_finish",
        "openclaw_resource_read",
        "edit",
        "update_plan",
        "read_todo",
        "task",
      ],
      enforceProviderBootstrapAdmission: true,
    });

    expect(receipt.status).toBe("accepted");
    expect(receipt.blockerKind).toBeNull();
    expect(receipt.blockers).toEqual([]);
    expect(receipt.bootstrapAdmission).toMatchObject({
      providerReportObserved: true,
      parentCanonicalDocsAdmitted: true,
      parentRequiredSkillsAdmitted: true,
      missingRequiredSources: [],
      truncatedRequiredSources: [],
    });
    expect(receipt.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_start_receipt_enforces_provider_bootstrap_admission",
        "node_agent_parent_canonical_docs_admitted_to_provider_context",
        "node_agent_parent_required_skills_admitted_to_provider_context",
      ]),
    );
  });

  it("keeps pre-session worker prompt proof nonterminal before provider bootstrap is observable", async () => {
    const start = prepare(await createExecutionConfig());
    expect(start.status).toBe("accepted");

    const receipt = withWorkerPromptSessionProof({
      receipt: start.receipt,
      workerPrompt: makeWorkerPrompt(),
      workerPromptArtifactRef: "runtime-job://job-test/node-worker-prompt/proof",
      sessionFilePath: "/tmp/openclaw-node-start-test/session.jsonl",
      systemPromptReport: null,
      effectiveToolNames: null,
      enforceProviderBootstrapAdmission: false,
    });

    expect(receipt.status).toBe("accepted");
    expect(receipt.blockerKind).toBeNull();
    expect(receipt.bootstrapAdmission.providerReportObserved).toBe(false);
    expect(receipt.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_start_receipt_provider_bootstrap_admission_not_yet_enforced",
        "node_agent_start_receipt_provider_prompt_report_not_observed",
      ]),
    );
    expect(receipt.reasonCodes).not.toContain("node_agent_provider_bootstrap_admission_blocked");
  });

  it("blocks worker prompt session proof when provider bootstrap report is missing after session run", async () => {
    const start = prepare(await createExecutionConfig());
    expect(start.status).toBe("accepted");

    const receipt = withWorkerPromptSessionProof({
      receipt: start.receipt,
      workerPrompt: makeWorkerPrompt(),
      workerPromptArtifactRef: "runtime-job://job-test/node-worker-prompt/proof",
      sessionFilePath: "/tmp/openclaw-node-start-test/session.jsonl",
      systemPromptReport: null,
      effectiveToolNames: [
        "node_finish",
        "openclaw_resource_read",
        "edit",
        "update_plan",
        "read_todo",
        "task",
      ],
      enforceProviderBootstrapAdmission: true,
    });

    expect(receipt.status).toBe("blocked");
    expect(receipt.blockerKind).toBe("node_agent_provider_bootstrap_report_missing");
    expect(receipt.blockers).toEqual(
      expect.arrayContaining([
        "node_agent_provider_bootstrap_report_missing",
        "node_agent_provider_canonical_docs_missing",
        "node_agent_provider_required_skills_missing",
      ]),
    );
    expect(receipt.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_start_receipt_enforces_provider_bootstrap_admission",
        "node_agent_provider_bootstrap_admission_blocked",
        "node_agent_start_receipt_provider_prompt_report_not_observed",
      ]),
    );
  });

  it("blocks worker prompt session proof when provider-visible bootstrap is missing or truncated", async () => {
    const start = prepare(await createExecutionConfig());
    expect(start.status).toBe("accepted");
    const report = makeProviderAdmissionReport({
      injectedWorkspaceFiles: [
        {
          name: "IDENTITY.md",
          path: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
          missing: false,
          rawChars: 10,
          injectedChars: 5,
          truncated: true,
        },
      ],
      skills: {
        promptChars: 0,
        entries: [],
      },
    });

    const receipt = withWorkerPromptSessionProof({
      receipt: start.receipt,
      workerPrompt: makeWorkerPrompt(),
      workerPromptArtifactRef: "runtime-job://job-test/node-worker-prompt/proof",
      sessionFilePath: "/tmp/openclaw-node-start-test/session.jsonl",
      systemPromptReport: report,
      effectiveToolNames: [
        "node_finish",
        "openclaw_resource_read",
        "edit",
        "update_plan",
        "read_todo",
        "task",
      ],
      enforceProviderBootstrapAdmission: true,
    });

    expect(receipt.status).toBe("blocked");
    expect(receipt.blockerKind).toBe("node_agent_provider_canonical_docs_missing");
    expect(receipt.blockers).toEqual(
      expect.arrayContaining([
        "node_agent_provider_canonical_docs_missing",
        "node_agent_provider_required_skills_missing",
        "node_agent_provider_bootstrap_sources_truncated",
      ]),
    );
    expect(receipt.bootstrapAdmission.missingRequiredSources).toEqual(
      expect.arrayContaining([
        "agent-doc:execution-coding:AGENTS.md",
        "agent-doc:execution-coding:BOOTSTRAP.md",
        "agent-doc:execution-coding:TOOLS.md",
        "skill:execution-coding:execution-node-workflow",
      ]),
    );
    expect(receipt.bootstrapAdmission.truncatedRequiredSources).toEqual([
      "agent-doc:execution-coding:IDENTITY.md",
    ]);
    expect(receipt.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_start_receipt_enforces_provider_bootstrap_admission",
        "node_agent_provider_bootstrap_admission_blocked",
        "node_agent_parent_canonical_docs_missing_from_provider_context",
        "node_agent_parent_required_skills_missing_from_provider_context",
        "node_agent_bootstrap_required_sources_truncated",
      ]),
    );
  });

  it("resolves executable node workspace to the current repo root by default", () => {
    expect(resolveOpenClawNodeExecutionWorkspaceDir()).toBe(path.resolve(process.cwd()));
  });

  it("resolves executable node workspace from agent projectRoot when configured", () => {
    const config = {
      agents: {
        list: [
          {
            id: "execution-coding",
            workspace: "/runtime/workspace",
            projectRoot: "/repo/openclaw",
          },
        ],
      },
    } as OpenClawConfig;

    expect(resolveOpenClawNodeExecutionWorkspaceDir(config, "execution-coding")).toBe(
      path.resolve("/repo/openclaw"),
    );
  });

  it("keeps explicit node execution workspace override above projectRoot", () => {
    vi.stubEnv("OPENCLAW_NODE_EXECUTION_WORKSPACE_DIR", "/override/project");
    const config = {
      agents: {
        list: [
          {
            id: "execution-coding",
            projectRoot: "/repo/openclaw",
          },
        ],
      },
    } as OpenClawConfig;

    try {
      expect(resolveOpenClawNodeExecutionWorkspaceDir(config, "execution-coding")).toBe(
        path.resolve("/override/project"),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("accepts execution agents and scouts under a global messaging profile when local allow is explicit", async () => {
    const result = prepare(
      await createExecutionConfig({
        globalTools: { profile: "messaging" },
      }),
    );

    expect(result.status).toBe("accepted");
    expect(result.receipt).toMatchObject({
      artifactKind: "execution_platform.node_agent_start_receipt",
      schemaVersion: "execution-platform.node-agent-start-receipt.v1",
      status: "accepted",
      nodeAttemptId: "attempt-1",
      nodeRunId: "nrun_test",
      sessionKey: "agent:execution-coding:node:nrun_test",
      promptRef: null,
      promptHash: null,
      submittedPromptHash: null,
      cwd: expect.stringContaining("execution-node-start-"),
      modelProvider: "openrouter",
      modelId: "moonshotai/kimi-k2.6",
      reasoningLevel: "stream",
      thinkingLevel: "xhigh",
      sourceRuntime: {
        projectRoot: expect.stringContaining("execution-node-start-"),
        executionPlatformDocsRoot: expect.stringContaining("execution-node-start-"),
        runtimeHome: expect.any(String),
        runtimeAliases: expect.arrayContaining([
          expect.objectContaining({
            aliasPath: path.resolve("/home/node/.openclaw"),
            canonicalPath: expect.any(String),
            label: "container-runtime-home-alias",
          }),
        ]),
        manifestRef: "repo://docs/system/registries/source-runtime-unification.yaml",
      },
      activeSkillNames: ["execution-node-workflow"],
      effectiveToolNames: expect.arrayContaining([
        "node_finish",
        "openclaw_resource_read",
        "edit",
        "update_plan",
        "read_todo",
        "task",
      ]),
      allowedSubagentIds: ["execution-context-scout", "execution-validation-scout"],
      snapshotRef: "node-execution-snapshot://impl-1",
      openClawSessionRef:
        "openclaw-session-file://%2Ftmp%2Fopenclaw-node-start-test%2Fsession.jsonl",
      openClawEffectiveToolInventoryRef:
        "openclaw-effective-tool-inventory://agent%3Aexecution-coding%3Anode%3Anrun_test",
      blockers: [],
      parentAgentId: "execution-coding",
      scoutAgentIds: ["execution-context-scout", "execution-validation-scout"],
      sessionFilePath: "/tmp/openclaw-node-start-test/session.jsonl",
      lockAcquisitionOutcome: "not_observed",
      blockerKind: null,
    });
    expect(result.receipt.activeConfigPath).toBeTruthy();
    expect(result.receipt.activeConfigFingerprint).toBeTruthy();
    expect(result.receipt.activeConfigEpoch).toBeTruthy();
    expect(result.receipt.sourceRuntime.runtimeAliases[0]?.canonicalPath).toBe(
      result.receipt.sourceRuntime.runtimeHome,
    );
    expect(result.receipt.sourceRuntime.executionPlatformDocsRoot).toBe(
      path.join(result.receipt.sourceRuntime.projectRoot ?? "", "docs/projects/execution-platform"),
    );
    expect(result.receipt.acceptedRequiredToolNames).toEqual(
      expect.arrayContaining([
        "node_finish",
        "openclaw_resource_read",
        "read_todo",
        "task",
        "execution-context-scout:grep",
        "execution-validation-scout:exec",
      ]),
    );
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["read"]));
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["write"]));
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["exec"]));
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["list"]));
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["glob"]));
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["grep"]));
    expect(result.receipt.effectiveToolNames).not.toEqual(
      expect.arrayContaining(["sessions_spawn"]),
    );
    expect(result.receipt.effectiveToolNames).not.toEqual(
      expect.arrayContaining(["sessions_yield"]),
    );
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["subagents"]));
    expect(result.receipt.effectiveToolNames).not.toEqual(expect.arrayContaining(["agents_list"]));
    expect(result.receipt.blockedTools).toEqual([]);
  });

  it("uses provider-effective native task catalog instead of blocking on hidden parent acquisition policy", async () => {
    const result = prepare(
      await createExecutionConfig({
        parentTools: {
          allow: [
            ...REQUIRED_NODE_TOOL_ALLOW,
            "read",
            "list",
            "glob",
            "grep",
            "exec",
            "process",
            "resolve_openclaw_resource",
            "sessions_spawn",
            "sessions_yield",
            "subagents",
            "agents_list",
          ],
        },
      }),
    );

    expect(result.status).toBe("accepted");
    expect(result.receipt.effectiveToolNames).toEqual(
      expect.arrayContaining(REQUIRED_NODE_TOOL_ALLOW),
    );
    expect(result.receipt.effectiveToolNames).not.toEqual(
      expect.arrayContaining([
        "read",
        "list",
        "glob",
        "grep",
        "exec",
        "process",
        "resolve_openclaw_resource",
        "sessions_spawn",
        "sessions_yield",
        "subagents",
        "agents_list",
      ]),
    );
    expect(result.receipt.blockedTools).toEqual([]);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["node_agent_start_native_openclaw_facts_accepted"]),
    );
  });

  it("blocks executable node start when execution-coding is not resolved to Kimi at highest reasoning", async () => {
    const config = await createExecutionConfig();
    const parent = config.agents?.list?.find(
      (entry): entry is NonNullable<NonNullable<typeof config.agents>["list"]>[number] =>
        typeof entry === "object" && entry !== null && entry.id === "execution-coding",
    );
    if (!parent || typeof parent !== "object") {
      throw new Error("fixture parent agent missing");
    }
    parent.model = { primary: "openrouter/deepseek/deepseek-v4-pro" };
    parent.thinkingDefault = "medium";
    parent.reasoningDefault = "off";

    const result = prepare(config);

    expect(result).toMatchObject({
      status: "blocked",
      blockerKind: "node_agent_model_profile_not_kimi",
      receipt: {
        status: "blocked",
        modelProvider: "openrouter",
        modelId: "deepseek/deepseek-v4-pro",
        reasoningLevel: "off",
        thinkingLevel: "medium",
      },
    });
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_model_profile_not_kimi",
        "node_agent_thinking_level_below_required_xhigh",
        "node_agent_reasoning_level_below_required",
      ]),
    );
  });
});
