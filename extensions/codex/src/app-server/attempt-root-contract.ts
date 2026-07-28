export function appendCodexAttemptRootContract(params: {
  developerInstructions: string | undefined;
  identityWorkspaceDir: string;
  executionCwd: string;
}): string {
  const rootContract = [
    "OpenClaw attempt roots (trusted runtime values):",
    `- identityWorkspaceDir: ${JSON.stringify(params.identityWorkspaceDir)}`,
    `- executionCwd: ${JSON.stringify(params.executionCwd)}`,
    "- Read persona, canonical documents, memory, skills, and governing artifacts from identityWorkspaceDir.",
    "- Use executionCwd for source discovery, shell commands, MCP/LSP operations, tests, and all source writes.",
    "- Treat identityWorkspaceDir as read-only. Do not infer either root from repository contents or temporary paths.",
  ].join("\n");
  const developerInstructions = params.developerInstructions?.trim();
  return developerInstructions ? `${developerInstructions}\n\n${rootContract}` : rootContract;
}
