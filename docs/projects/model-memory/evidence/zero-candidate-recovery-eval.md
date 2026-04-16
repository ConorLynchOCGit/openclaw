# Bounded Candidate Adjudication Evaluation

- Generated at: 2026-04-15T20:26:18.930Z
- Duplicate audit: /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/duplicate-escape-audit.json
- Duplicate review: /root/services/openclaw-roles/live/docs/projects/model-memory/evidence/duplicate-escape-review.json
- DB mode: full_corpus_proof_db
- Database: model_memory
- Model: openrouter/openai/gpt-5.4-nano
- Sample size: 16
- Basket composition: {"known_legitimate_match":6,"legit_distinct_control":6,"ambiguity_control":4}
- Candidate source composition: {"retained_structural":15,"none":1}

## Summary

- Overall conversion rate: 100.0%
- False-merge rate: 0.0%
- Ambiguous rate: 0.0%
- Retained-candidate success rate: 100.0%
- Zero-candidate fallback success rate: 0.0%
- Candidate count distribution: {"0":1,"2":3,"3":1,"4":2,"5":9}
- Selection mode distribution: {"top2_or_3":15,"none":1}

## Cases

### rerun-ecb2ca60-a6a5-56c9-aa25-2ee522c7bf73

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_b75e13a5e00d0d2c27efb52b
- Source: AGENTS.md
- Kind: rule
- Label: known_legitimate_match
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: e3f59024-6f86-5902-982f-e50bfd0cd4be, 0d7f1923-854a-5ba9-a9bf-40fdc48ff4b0, 93f9523e-c475-5a78-b542-bac132adc11a, 042d7e0a-da26-53f5-8aab-b6c533ee6c57, 3126e51a-d494-57a4-9215-d01bae41e4c0
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-ecb2ca60-a6a5-56c9-aa25-2ee522c7bf73","sameCoreMemory":"yes","matchedCandidateId":"candidate_1","deltaType":"non_additive"}
- Final route: direct_attach_support
- Converted: true
- False merge risk: false
- Stayed contained: false

### rerun-6c4e531b-5a0f-55cf-ba89-0c5e6726d3f4

- Case identity: docs/help/testing.md::testing::fact_fa606b42f1cd1f4a4b82b1f5
- Source: docs/help/testing.md
- Kind: fact
- Label: known_legitimate_match
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 904467e3-9095-5629-91d7-7384dcda4e14, ee291b24-7748-5e78-8745-c000a4511b3d, 7c1248c7-bb24-5a14-acea-45f77002a436, 8f7d28d3-dc6a-5294-8ca4-0c28e6cec824
- Selected scores: 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-6c4e531b-5a0f-55cf-ba89-0c5e6726d3f4","sameCoreMemory":"yes","matchedCandidateId":"candidate_1","deltaType":"non_additive"}
- Final route: direct_attach_support
- Converted: true
- False merge risk: false
- Stayed contained: false

### rerun-9fe78fe9-3b3f-55eb-9e90-5ada852549ed

- Case identity: docs/help/testing.md::testing::fact_fa1bee72803437f568d6bb04
- Source: docs/help/testing.md
- Kind: fact
- Label: known_legitimate_match
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: e3530a8e-83a9-5536-8b05-b7198d3c05c2, b603bf56-1ef9-5861-b7fa-a182361b8b1e, d32f8e70-347f-50b2-b018-c1a5fe1fbf78, da4a0e99-1a98-5ad5-a7c6-98e0c23b5fbe
- Selected scores: 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-9fe78fe9-3b3f-55eb-9e90-5ada852549ed","sameCoreMemory":"yes","matchedCandidateId":"candidate_1","deltaType":"non_additive"}
- Final route: direct_attach_support
- Converted: true
- False merge risk: false
- Stayed contained: false

### rerun-9c0f2b0a-a1b9-5b0f-a064-1c6b9c30cf7f

- Case identity: docs/gateway/configuration.md::configuration::fact_42ae3daa81a4285e5fdfa833
- Source: docs/gateway/configuration.md
- Kind: fact
- Label: known_legitimate_match
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 70471ee6-2844-5f29-bb51-4543a20f1b12, af166c5e-fe93-51e6-8d1f-c01b63b1d292, d8969911-4c06-535c-8d7d-c3706c0719e0
- Selected scores: 1, 1, 1
- Model decision: {"candidateId":"rerun-9c0f2b0a-a1b9-5b0f-a064-1c6b9c30cf7f","sameCoreMemory":"yes","matchedCandidateId":"candidate_1","deltaType":"non_additive"}
- Final route: direct_attach_support
- Converted: true
- False merge risk: false
- Stayed contained: false

### rerun-00e1f898-bc88-5045-ac49-360f2343668a

- Case identity: docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::fact_0bb586ac183adcb49004ce11
- Source: docs/gateway/configuration.md
- Kind: fact
- Label: known_legitimate_match
- Candidate source: retained_structural
- Historical decision: supersede
- Candidate selection mode: top2_or_3
- Selected candidates: 8286d8b3-ebe3-50c2-91bd-a9ef85b3cc2b, 652c35b2-0214-5e77-a09a-c59999f18de9
- Selected scores: 1, 1
- Model decision: {"candidateId":"rerun-00e1f898-bc88-5045-ac49-360f2343668a","sameCoreMemory":"yes","matchedCandidateId":"candidate_1","deltaType":"non_additive"}
- Final route: direct_attach_support
- Converted: true
- False merge risk: false
- Stayed contained: false

### rerun-a032fe54-6900-5d28-8ca5-b44024de67f1

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_1594ec8dbdc7d0e532ba35cb
- Source: AGENTS.md
- Kind: rule
- Label: known_legitimate_match
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 1febdc79-a316-57fc-96ab-ba48f468961a, 4da93c1a-baa1-5de5-9181-4ed5f0d88560
- Selected scores: 1, 1
- Model decision: {"candidateId":"rerun-a032fe54-6900-5d28-8ca5-b44024de67f1","sameCoreMemory":"yes","matchedCandidateId":"candidate_1","deltaType":"non_additive"}
- Final route: direct_attach_support
- Converted: true
- False merge risk: false
- Stayed contained: false

### rerun-0f1a11dd-fb49-50d8-8b2f-0fe56681912f

- Case identity: docs/help/testing.md::testing::rule_024a76e951c684845ebbb3f7
- Source: docs/help/testing.md
- Kind: rule
- Label: legit_distinct_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 212969ea-31fd-5e76-a397-847f61ec0000, d2e3e0f6-4f14-5c2e-9df1-60c43d08425b, fad2e3a9-23fc-5938-8bc3-cfff1af073bf, 43fa8976-b1e3-5b60-88f5-752be798f521, 2394fbb7-9adb-5df1-a90d-92a9de61c32c
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-0f1a11dd-fb49-50d8-8b2f-0fe56681912f","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-59e58a61-441a-5723-be56-89bfbffa3a30

- Case identity: docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::rule_421bfdc7b5cbcb29e0c0b27d
- Source: docs/gateway/configuration.md
- Kind: rule
- Label: legit_distinct_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 72116db5-3547-5b04-b6a9-d3ff57890a2c, 4ace8a0d-fe7c-55da-a4c4-10aebb15116e, 76695be1-6145-5f3d-88ce-26c04502560e, e04350a7-967c-5f80-a0d0-8ca40b2b9d59, 546516c1-dcde-5965-94c5-d59145d96036
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-59e58a61-441a-5723-be56-89bfbffa3a30","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-8f7d28d3-dc6a-5294-8ca4-0c28e6cec824

- Case identity: docs/help/testing.md::testing::fact_695c816f149438d96707ab70
- Source: docs/help/testing.md
- Kind: fact
- Label: legit_distinct_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 904467e3-9095-5629-91d7-7384dcda4e14, ee291b24-7748-5e78-8745-c000a4511b3d, 7c1248c7-bb24-5a14-acea-45f77002a436, 56d53451-1bd8-5055-b537-4feebe03bcfb, da4a0e99-1a98-5ad5-a7c6-98e0c23b5fbe
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-8f7d28d3-dc6a-5294-8ca4-0c28e6cec824","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-96f254b5-221c-5a4c-a674-6621216b3d19

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_78a76963474a86681a8aae85
- Source: AGENTS.md
- Kind: rule
- Label: legit_distinct_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 3126e51a-d494-57a4-9215-d01bae41e4c0, 0d7f1923-854a-5ba9-a9bf-40fdc48ff4b0, e3f59024-6f86-5902-982f-e50bfd0cd4be, 93f9523e-c475-5a78-b542-bac132adc11a, 042d7e0a-da26-53f5-8aab-b6c533ee6c57
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-96f254b5-221c-5a4c-a674-6621216b3d19","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-e8995751-48cd-54e6-a550-16df7b37adfa

- Case identity: docs/gateway/configuration.md::configuration::fact_523838d0bffa253090a2d7bf
- Source: docs/gateway/configuration.md
- Kind: fact
- Label: legit_distinct_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: e1cb73a5-dcb3-5347-a6a4-28a2206ee368, 3b997a55-f8b1-5f72-8e87-8f0601ae26f4
- Selected scores: 1, 1
- Model decision: {"candidateId":"rerun-e8995751-48cd-54e6-a550-16df7b37adfa","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-001641dd-ed15-5e44-be90-e0b7e63aee56

- Case identity: AGENTS.md::repository guidelines>security & configuration tips::rule_e1f98e7d43623faabb5fde82
- Source: AGENTS.md
- Kind: rule
- Label: legit_distinct_control
- Candidate source: none
- Historical decision: write
- Candidate selection mode: none
- Selected candidates: none
- Selected scores: none
- Model decision: none
- Final route: no_candidates
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-098ba11a-a3ff-5396-b0a8-f85288f251ef

- Case identity: AGENTS.md::repository guidelines::rule_ee209a084f7d8090ff8568e5
- Source: AGENTS.md
- Kind: rule
- Label: ambiguity_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 89ac9a48-06f7-55cb-97a9-1074f4d29a19, 325ee2ee-61b5-5039-bcfb-8a883ee50dd8, aa1b3012-fddb-5401-bdb3-382c866e6d5c, e2127692-5dcd-516f-8b17-3626ca6bc9ed, a0f4ac61-b957-59b3-b9e6-7c9783dc9f3b
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-098ba11a-a3ff-5396-b0a8-f85288f251ef","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-126478b9-53cc-5346-b7da-478d100163e8

- Case identity: docs/help/testing.md::testing>live: model matrix (what we cover)>modern smoke set (tool calling + image)::fact_13e8587d50856efe2ed82bc9
- Source: docs/help/testing.md
- Kind: fact
- Label: ambiguity_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 1b8b0a62-8415-526b-8e55-62388a6bf61a, 79ba850b-288b-584e-865e-50d11b080df8, f88e5225-9826-50da-abd7-36f4ff18611e, 7195f0bc-9f78-5807-a934-d46be208c1a4, d8969911-4c06-535c-8d7d-c3706c0719e0
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-126478b9-53cc-5346-b7da-478d100163e8","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-23c7d058-fd08-54f4-8926-ed7df81b8e59

- Case identity: docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::rule_678114da2008911e318b7bc9
- Source: docs/gateway/configuration.md
- Kind: rule
- Label: ambiguity_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 55b58870-be35-5bf6-9636-127ab9bdb533, 72116db5-3547-5b04-b6a9-d3ff57890a2c, 5a1c1f9d-7808-5ccf-9b7d-126b1f9ae547, 10b7e371-dd7d-55a3-83b8-39c5af5512d8, 4ace8a0d-fe7c-55da-a4c4-10aebb15116e
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-23c7d058-fd08-54f4-8926-ed7df81b8e59","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false

### rerun-32723415-ae40-5d46-8443-d3d55ac80593

- Case identity: docs/help/testing.md::testing>live: model matrix (what we cover)>modern smoke set (tool calling + image)::rule_da9ffa474ea2d570d026d2be
- Source: docs/help/testing.md
- Kind: rule
- Label: ambiguity_control
- Candidate source: retained_structural
- Historical decision: write
- Candidate selection mode: top2_or_3
- Selected candidates: 91942563-fc38-5c1e-8593-c21782706dcb, 3ac2db64-81b5-501d-8818-78f07da9d9a8, d013cfc4-c550-5357-8fc8-bf3f0b295c0b, 254ab877-f0ca-5594-a00f-5ef654d72de9, 4bb7ea6c-318c-57f2-aa98-0b6c0643ae55
- Selected scores: 1, 1, 1, 1, 1
- Model decision: {"candidateId":"rerun-32723415-ae40-5d46-8443-d3d55ac80593","sameCoreMemory":"no","matchedCandidateId":"none","deltaType":"unclear"}
- Final route: direct_distinct
- Converted: false
- False merge risk: false
- Stayed contained: false
