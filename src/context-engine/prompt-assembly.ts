export type ContextPromptAssemblyInput = {
  baseSystemPrompt: string;
  basePrompt: string;
  contextEngineSystemPromptAddition?: string;
  hookSystemPromptOverride?: string;
  hookPrependSystemContext?: string;
  hookAppendSystemContext?: string;
  hookPrependContext?: string;
};

export type ContextPromptAssemblyResult = {
  systemPrompt: string;
  prompt: string;
};

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function wrapSystemContext(params: {
  systemPrompt: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
}): string {
  const prepend = normalizeText(params.prependSystemContext);
  const append = normalizeText(params.appendSystemContext);
  const sections = [prepend, params.systemPrompt.trim(), append].filter(
    (value) => value.length > 0,
  );
  return sections.join("\n\n");
}

export function composeContextPromptAssembly(
  params: ContextPromptAssemblyInput,
): ContextPromptAssemblyResult {
  const basePrompt = params.basePrompt.trim();
  const hookPrependContext = normalizeText(params.hookPrependContext);
  const hookSystemPromptOverride = normalizeText(params.hookSystemPromptOverride);
  const contextEngineSystemPromptAddition = normalizeText(params.contextEngineSystemPromptAddition);

  let systemPrompt = hookSystemPromptOverride || params.baseSystemPrompt.trim();
  if (!hookSystemPromptOverride && contextEngineSystemPromptAddition) {
    systemPrompt = `${contextEngineSystemPromptAddition}\n\n${systemPrompt}`;
  }
  if (!hookSystemPromptOverride) {
    systemPrompt = wrapSystemContext({
      systemPrompt,
      prependSystemContext: params.hookPrependSystemContext,
      appendSystemContext: params.hookAppendSystemContext,
    });
  }

  return {
    systemPrompt,
    prompt: hookPrependContext ? `${hookPrependContext}\n\n${basePrompt}` : basePrompt,
  };
}
