#!/usr/bin/env node
process.env.MODEL_MEMORY_PHASE2_HIGH_CONTEXT_CANDIDATE_REVIEW_PROOF = "1";
await import("./model-memory-phase2-model-reviewed-candidate-discovery-proof.mjs");
