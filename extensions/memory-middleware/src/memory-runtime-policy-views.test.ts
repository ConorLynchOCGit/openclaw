import { describe, expect, it } from "vitest";
import {
  getMemoryCorrectionRuntimePolicy,
  getMemoryLifecycleRuntimePolicy,
  getMemoryRetrievalRuntimePolicy,
  getMemorySemanticRoutingRuntimePolicy,
  listApprovedMemoryRetrievalRuntimePolicies,
} from "./memory-runtime-policy-views.js";

describe("memory runtime policy views", () => {
  it("returns the internal lifecycle and correction policies for each active runtime lane", () => {
    expect(getMemoryLifecycleRuntimePolicy("workflow_improvement")).toEqual({
      pendingCandidateStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      staleWindowDays: 3,
    });
    expect(getMemoryCorrectionRuntimePolicy("recurring_procedure")).toEqual({
      mode: "validated_procedure_supersede_when_targeted",
      targetKind: "validated_procedure",
      requiresExistingTarget: false,
    });
  });

  it("returns the retrieval and semantic-routing posture without consulting the SDK family registry", () => {
    expect(getMemoryRetrievalRuntimePolicy("project_rule")).toEqual({
      featureWeights: {
        family_intent_match: 95,
        project_scope_match: 210,
        subject_match: 165,
        recommended_action_match: 95,
        avoid_action_match: 90,
        guidance_pattern_match: 40,
      },
      directIntentClass: "rule",
      matchedFieldPrefix: "project_rule",
    });
    expect(getMemorySemanticRoutingRuntimePolicy("workflow_improvement")).toEqual({
      mode: "family_gated_approved_only",
    });
  });

  it("lists the approved retrieval policies on the canonical internal table", () => {
    expect(listApprovedMemoryRetrievalRuntimePolicies()).toEqual([
      {
        id: "response_style",
        storageKinds: ["memory_object", "phrase_pattern"],
        derivedViews: ["response_style"],
        retrievalPolicy: {
          featureWeights: {
            subject_match: 170,
            value_match: 105,
          },
          directIntentClass: "style",
          matchedFieldPrefix: "response_style",
        },
      },
      {
        id: "project_fact",
        storageKinds: ["memory_object"],
        derivedViews: ["project_fact"],
        retrievalPolicy: {
          featureWeights: {
            family_intent_match: 90,
            project_scope_match: 205,
            subject_match: 180,
            value_match: 100,
          },
          directIntentClass: "fact",
          matchedFieldPrefix: "project_fact",
        },
      },
      {
        id: "workflow_improvement",
        storageKinds: ["memory_object", "phrase_pattern"],
        derivedViews: ["workflow_guidance", "learned_guidance"],
        retrievalPolicy: {
          featureWeights: {
            subject_match: 170,
            recommended_action_match: 95,
            avoid_action_match: 90,
            guidance_pattern_match: 40,
          },
          matchedFieldPrefix: "generalized",
        },
      },
      {
        id: "project_rule",
        storageKinds: ["memory_object"],
        derivedViews: ["project_rule"],
        retrievalPolicy: {
          featureWeights: {
            family_intent_match: 95,
            project_scope_match: 210,
            subject_match: 165,
            recommended_action_match: 95,
            avoid_action_match: 90,
            guidance_pattern_match: 40,
          },
          directIntentClass: "rule",
          matchedFieldPrefix: "project_rule",
        },
      },
      {
        id: "unmet_need",
        storageKinds: ["memory_object"],
        derivedViews: ["unmet_need"],
        retrievalPolicy: {
          featureWeights: {
            family_intent_match: 130,
            project_scope_match: 205,
            subject_match: 160,
            needed_capability_match: 110,
          },
          directIntentClass: "need",
          matchedFieldPrefix: "unmet_need",
        },
      },
    ]);
  });
});
