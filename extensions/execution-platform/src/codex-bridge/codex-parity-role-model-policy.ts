export type CodexParityRoleId =
  | "orchestrator"
  | "context_scout"
  | "implementation_standard"
  | "implementation_complex"
  | "test_engineer"
  | "reviewer"
  | "security_privacy_reviewer"
  | "docs_skills_writer"
  | "observability_scribe";

export type CodexParityProviderPath =
  | "codex_app_server"
  | "codex_parity_runtime_adapter"
  | "openrouter"
  | "runtime_worker";

export type CodexParityRoleModelSelection = {
  roleId: CodexParityRoleId;
  modelRef: string;
  providerPath: CodexParityProviderPath;
  workerRef: string;
  policyRef: string;
  reasoningEffort: "low" | "medium" | "high" | "xhigh" | "not_applicable";
  maxOutputTokens: number;
  timeoutMs: number;
  codexNativeSubagentsAllowed: boolean;
  openClawRoleEvidenceRequired: true;
  missingConfigBlocker: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type CodexParityRoleModelPolicyInput = {
  availableModelRefs?: string[];
  codexGpt55Available?: boolean;
  codexCodingModelRef?: string | null;
  kimiAvailable?: boolean;
  deepseekAvailable?: boolean;
};

const GPT_55 = "openai-codex/gpt-5.5";
const KIMI = "moonshotai/kimi-k2.6";
const DEEPSEEK_FLASH = "deepseek/deepseek-v4-flash";
const DEEPSEEK_PRO = "deepseek/deepseek-v4-pro";
const DISALLOWED_SILENT_COMPLEX_DEFAULTS = new Set(["openai-codex/gpt-5.3-codex"]);

function has(input: CodexParityRoleModelPolicyInput, modelRef: string): boolean {
  return input.availableModelRefs?.includes(modelRef) ?? false;
}

function codexGpt55Available(input: CodexParityRoleModelPolicyInput): boolean {
  return input.codexGpt55Available === true || has(input, GPT_55);
}

function kimiAvailable(input: CodexParityRoleModelPolicyInput): boolean {
  return input.kimiAvailable === true || has(input, KIMI);
}

function deepseekAvailable(input: CodexParityRoleModelPolicyInput): boolean {
  return input.deepseekAvailable === true || has(input, DEEPSEEK_FLASH) || has(input, DEEPSEEK_PRO);
}

function selection(
  value: Omit<
    CodexParityRoleModelSelection,
    | "openClawRoleEvidenceRequired"
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
  >,
): CodexParityRoleModelSelection {
  return {
    ...value,
    openClawRoleEvidenceRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function selectCodexParityRoleModel(
  roleId: CodexParityRoleId,
  input: CodexParityRoleModelPolicyInput = {},
): CodexParityRoleModelSelection {
  if (roleId === "orchestrator") {
    const available = codexGpt55Available(input);
    return selection({
      roleId,
      modelRef: GPT_55,
      providerPath: "codex_app_server",
      workerRef: "worker.model-task.codex-app-server.orchestrator",
      policyRef: "policy://codex-parity/openclaw-role/orchestrator/gpt-5.5",
      reasoningEffort: "xhigh",
      maxOutputTokens: 16_000,
      timeoutMs: 900_000,
      codexNativeSubagentsAllowed: false,
      missingConfigBlocker: available ? null : "codex_gpt_5_5_orchestrator_not_configured",
      reasonCodes: available
        ? ["orchestrator_gpt_5_5_selected", "openclaw_role_evidence_required"]
        : ["orchestrator_gpt_5_5_missing"],
    });
  }

  if (roleId === "context_scout") {
    const available = kimiAvailable(input) || deepseekAvailable(input);
    const modelRef = kimiAvailable(input) ? KIMI : DEEPSEEK_PRO;
    return selection({
      roleId,
      modelRef,
      providerPath: "openrouter",
      workerRef: "worker.model-task.context-scout",
      policyRef: `policy://codex-parity/openclaw-role/context-scout/${modelRef}`,
      reasoningEffort: "medium",
      maxOutputTokens: 12_000,
      timeoutMs: 600_000,
      codexNativeSubagentsAllowed: false,
      missingConfigBlocker: available ? null : "context_scout_model_not_configured",
      reasonCodes: available
        ? ["cheap_large_context_role_selected", "openclaw_role_evidence_required"]
        : ["context_scout_model_missing"],
    });
  }

  if (roleId === "implementation_standard") {
    const available = kimiAvailable(input);
    return selection({
      roleId,
      modelRef: KIMI,
      providerPath: "openrouter",
      workerRef: "worker.kimi.file-implementation",
      policyRef: "policy://codex-parity/openclaw-role/implementation-standard/kimi",
      reasoningEffort: "medium",
      maxOutputTokens: 12_000,
      timeoutMs: 600_000,
      codexNativeSubagentsAllowed: false,
      missingConfigBlocker: available ? null : "kimi_standard_implementation_not_configured",
      reasonCodes: available
        ? ["kimi_standard_implementation_selected", "patch_evidence_required"]
        : ["kimi_standard_implementation_missing"],
    });
  }

  if (roleId === "implementation_complex") {
    const requestedModelRef = input.codexCodingModelRef?.trim();
    const modelRef = requestedModelRef || GPT_55;
    const explicitLegacySelection = Boolean(
      requestedModelRef && DISALLOWED_SILENT_COMPLEX_DEFAULTS.has(requestedModelRef),
    );
    const available =
      (modelRef === GPT_55 && codexGpt55Available(input)) ||
      Boolean(requestedModelRef?.trim()) ||
      has(input, modelRef);
    return selection({
      roleId,
      modelRef,
      providerPath: "codex_parity_runtime_adapter",
      workerRef: "worker.codex.parity-runtime-adapter",
      policyRef: `policy://codex-parity/openclaw-role/implementation-complex/${modelRef}`,
      reasoningEffort: "xhigh",
      maxOutputTokens: 32_000,
      timeoutMs: 3_600_000,
      codexNativeSubagentsAllowed: true,
      missingConfigBlocker: available ? null : "codex_complex_implementation_model_not_configured",
      reasonCodes: available
        ? [
            "codex_parity_complex_implementation_selected",
            modelRef === GPT_55
              ? "codex_gpt_5_5_complex_implementation_selected"
              : "explicit_non_default_complex_implementation_model_selected",
            ...(explicitLegacySelection ? ["explicit_legacy_codex_5_3_selection_recorded"] : []),
            "codex_native_subagents_internal_only",
            "openclaw_role_evidence_required",
          ]
        : ["codex_complex_implementation_model_missing"],
    });
  }

  if (roleId === "test_engineer" || roleId === "observability_scribe") {
    const available = deepseekAvailable(input) || kimiAvailable(input);
    const modelRef = deepseekAvailable(input) ? DEEPSEEK_FLASH : KIMI;
    return selection({
      roleId,
      modelRef,
      providerPath: deepseekAvailable(input) ? "openrouter" : "openrouter",
      workerRef: `worker.model-task.${roleId}`,
      policyRef: `policy://codex-parity/openclaw-role/${roleId}/${modelRef}`,
      reasoningEffort: "low",
      maxOutputTokens: 8_000,
      timeoutMs: 300_000,
      codexNativeSubagentsAllowed: false,
      missingConfigBlocker: available ? null : `${roleId}_model_not_configured`,
      reasonCodes: available
        ? ["fast_bounded_role_selected", "openclaw_role_evidence_required"]
        : [`${roleId}_model_missing`],
    });
  }

  const available = codexGpt55Available(input) || deepseekAvailable(input);
  const modelRef = codexGpt55Available(input) ? GPT_55 : DEEPSEEK_PRO;
  return selection({
    roleId,
    modelRef,
    providerPath: codexGpt55Available(input) ? "codex_app_server" : "openrouter",
    workerRef: `worker.model-task.${roleId}`,
    policyRef: `policy://codex-parity/openclaw-role/${roleId}/${modelRef}`,
    reasoningEffort: "high",
    maxOutputTokens: 12_000,
    timeoutMs: 600_000,
    codexNativeSubagentsAllowed: false,
    missingConfigBlocker: available ? null : `${roleId}_model_not_configured`,
    reasonCodes: available
      ? ["review_role_selected", "openclaw_role_evidence_required"]
      : [`${roleId}_model_missing`],
  });
}

export function buildCodexParityRoleModelPolicy(
  input: CodexParityRoleModelPolicyInput = {},
): CodexParityRoleModelSelection[] {
  return [
    "orchestrator",
    "context_scout",
    "implementation_standard",
    "implementation_complex",
    "test_engineer",
    "reviewer",
    "security_privacy_reviewer",
    "docs_skills_writer",
    "observability_scribe",
  ].map((roleId) => selectCodexParityRoleModel(roleId as CodexParityRoleId, input));
}
