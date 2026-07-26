---
name: source-evidence-quality-review
description: Use when reviewing source-backed claims, research memos, social/source intelligence, evidence ledgers, or plans that depend on X, Reddit, web, docs, codebase, analytics, reviews, forums, or other external/internal evidence.
---

# Source Evidence Quality Review

Use this skill when reviewer checks whether evidence actually supports the plan.

## Positive Patterns

Strong evidence handling:

- source type is named and appropriate for the claim;
- source URL, file, artifact, source item, or session ref is present;
- high-signal context is included when wording matters;
- child/source results include what the parent should verify and where the full
  result can be read;
- child/source results include a credible stop rationale when they are scout
  Context Packs;
- source trajectory is bounded enough that the packet represents decision
  sufficiency rather than source exhaustion;
- read-debt is visible: after the first viable P1/P2 set, each extra
  read/fetch/search is tied to a possible decision change, contradiction,
  blocker, owner/test discovery, confidence downgrade, or native-fit risk;
- post-P1/P2 source work is single-action and decision-driven, not another
  batch of adjacent reads/fetches/searches;
- parent synthesis shows which child refs or source artifacts were inspected
  directly for plan-changing claims;
- source freshness and route limits are visible;
- recommendation freshness is visible: the plan distinguishes
  `already_implemented`, `implemented_but_weak`, `partial`, `net_new`,
  `rejected_architecture`, `rejected_stale`, `watch`, and `investigate`
  candidate work before recommending action;
- X is treated as hypothesis/operator discourse, not truth;
- Reddit/public-web fallback is labeled with route tier and confidence limits;
- official docs or code verify factual implementation constraints;
- contradictory evidence is preserved;
- do-not-conclude guidance prevents overreach;
- durable GBrain memory is curated, de-identified when needed, and attributed.
- each promised analytical decision is supported by a coherent chain from
  observable and source operation through comparison design, inference limits,
  adversarial case, bounded live falsification, and acceptance;
- official capability/policy evidence and practitioner-method evidence are
  both used when they answer different material questions;
- transport, acquisition, analytical validity, product usefulness, and
  operational acceptance are proved as separate classes;
- entitlement, auth, freshness, sampling, pagination, retention, cost, and
  policy assumptions are explicit where they can invalidate the method.

## Negative Patterns

Require revisions or block when output:

- says "research says" while flattening source types;
- uses X engagement as proof;
- treats Firecrawl/search Reddit fallback as official Reddit coverage;
- quotes social/user content too heavily or stores raw payloads in memory;
- makes market-size, legal, medical, financial, or technical claims from social
  evidence alone;
- cites stale docs without version/date awareness;
- uses snippets without opening/confirming the underlying source when the claim
  matters;
- recommends work that is already implemented and working as if it is net-new;
- fails to cite current implementation evidence for each net-new or hardening
  recommendation;
- treats unknown implementation status as a recommendation instead of an
  investigation;
- omits failed source routes that lower confidence;
- hides source conflict;
- lacks refs for plan-changing claims.
- lacks a stop rationale for scout Context Packs;
- presents a good final packet after excessive source touring without naming
  the trajectory problem;
- continues reading after a viable P1/P2 set without explaining how those
  extra reads could change the parent decision;
- does another source batch after a viable P1/P2 set instead of returning a
  packet or justifying one specific decision-changing source action;
- relies on child summaries without source excerpts or result pointers when the
  parent is expected to synthesize a plan;
- accepts a child claim without inspecting a ref when the claim materially
  drives architecture, execution, policy, or strategy;
- does not preserve enough bounded source context for a reviewer to understand
  why the plan changed.
- lacks a Parent Evidence Ledger for an execution-grade plan;
- accepts implementation-driving code/runtime claims without parent-inspected
  refs or explicit `scout-reported` / `unverified` status;
- fails to record skipped/unavailable source lanes that would affect
  confidence;
- uses public snippets as representative Reddit evidence.
- approves an analytical method because a tool, endpoint, schema, or HTTP 200
  exists without showing that the acquired observables can support the promised
  decision;
- substitutes a transport smoke test for an intelligence-quality or
  operational-readiness proof;
- omits the cheapest bounded live falsification that could invalidate a
  plan-critical method before implementation;
- proposes rankings, trends, influence, performance, causality, or
  recommendation claims without a comparison design, inference limits, and
  adversarial counterexample;
- relies only on provider documentation for a practitioner workflow whose
  real-world method materially affects the design, or relies on practitioner
  advice for official capability and policy claims.

## Source Weighting

- Codebase/source truth beats guesses about an existing system.
- Official docs and standards beat social claims for feasibility and policy.
- Analytics beats generic advice for observed performance, subject to data
  quality.
- Reddit/reviews are strong for language, objections, and purchase regret.
- X is strong for current operator experiments and hypotheses.
- Competitor/public pages are strong for positioning, packaging, and market
  language, not truth about effectiveness.

## Output

Return:

```markdown
## Verdict

## Evidence Findings

- Claim:
  Source issue:
  Why it matters:
  Required fix:

## Overclaims

## Missing Verification

## Method Feasibility

- Operator decision and promised claim:
- Required observable and source operation:
- Sample/comparison design:
- Inference limits and adversarial case:
- Cheapest live falsification:
- Proof-class gaps:

## Scout Trajectory Issues

- First viable P1/P2 set:
- Extra reads/fetches/searches after that point:
- Decision-impact rationale:
- Over-read / under-read judgment:

## Confidence Impact

## Freshness / Implementation Status Issues

- Recommendation:
  Status problem:
  Evidence needed:
  Required fix:
```
