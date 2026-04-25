#!/usr/bin/env node

import { runNodeStep } from "./root-gate-runtime.mjs";

const MODEL_MEMORY_NODE_TESTS = [
  ["--import", "tsx", "--test", "scripts/model-memory-bootstrap-projection.test.ts"],
];

const MODEL_MEMORY_PUSH_TARGETS = [
  "extensions/model-memory",
  "src/agents/model-memory*.test.ts",
  "src/plugins/model-memory-tool-surface.test.ts",
  "src/gateway/*memory*.test.ts",
  "src/gateway/server.sessions-send.test.ts",
];

const DOMAIN_LANES = {
  "gateway-memory": {
    description: "Gateway/session memory capture and live-runtime seams",
    testProjectTargets: [
      "src/gateway/*memory*.test.ts",
      "src/gateway/server.sessions-send.test.ts",
      "src/agents/model-memory.session-turn-proof.test.ts",
      "src/agents/model-memory.live-runtime*.test.ts",
      "src/agents/model-memory.live-json-executor.test.ts",
      "src/agents/model-memory.live-vs-replay-parity.test.ts",
      "extensions/model-memory/src/live-ordinary-turn-capture-service*.test.ts",
      "extensions/model-memory/src/live-shadow-adapters.test.ts",
      "extensions/model-memory/src/live-document-ingestion-service.test.ts",
    ],
  },
  "model-memory": {
    description: "Model Memory extension plus agent/tool integration coverage",
    nodeTests: MODEL_MEMORY_NODE_TESTS,
    testProjectTargets: MODEL_MEMORY_PUSH_TARGETS,
  },
  "model-memory-push": {
    description:
      "De-duplicated Model Memory push coverage across extension, gateway/session memory, retrieval, proof, graph, and capsule tests",
    nodeTests: MODEL_MEMORY_NODE_TESTS,
    testProjectTargets: MODEL_MEMORY_PUSH_TARGETS,
  },
  retrieval: {
    description: "Model Memory retrieval, context, proof, capsule, and graph lanes",
    testProjectTargets: [
      "extensions/model-memory/src/retrieval*.test.ts",
      "extensions/model-memory/src/real-retrieval-request-interpreter.test.ts",
      "extensions/model-memory/src/retrieval-request-interpreter.test.ts",
      "extensions/model-memory/src/runtime/retrieval",
      "extensions/model-memory/src/runtime/context",
      "extensions/model-memory/src/runtime-read-models.test.ts",
      "extensions/model-memory/src/runtime-graph.test.ts",
      "extensions/model-memory/src/project-state-capsule.test.ts",
      "extensions/model-memory/src/derived-artifact.test.ts",
      "extensions/model-memory/src/proof",
    ],
  },
};

function printUsage() {
  const lanes = Object.entries(DOMAIN_LANES)
    .map(([name, lane]) => `  ${name}: ${lane.description}`)
    .join("\n");
  console.error(`Usage: node scripts/test-domain-lane.mjs <lane>\n\nAvailable lanes:\n${lanes}`);
}

const laneName = process.argv[2];
const lane = laneName ? DOMAIN_LANES[laneName] : null;

if (!lane) {
  printUsage();
  process.exit(1);
}

console.error(`[test-domain] ${laneName}: ${lane.description}`);

for (const nodeTestArgs of lane.nodeTests ?? []) {
  runNodeStep(nodeTestArgs);
}

if (lane.testProjectTargets.length > 0) {
  runNodeStep(["scripts/test-projects.mjs", ...lane.testProjectTargets]);
}
