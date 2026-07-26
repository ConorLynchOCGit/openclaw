---
name: useful-proof-design
description: Use when designing, reviewing, or selecting a proof, validation run, implementation slice, readiness check, regression check, or end-to-end workflow proof for OpenClaw/Codex/GBrain work; especially when the proof must avoid self-referential theater, prompt-babysat routing, stale markers, or deterministic harnesses and instead advance real product, architecture, workflow, or operational work.
---

# Useful Proof Design

Use this skill to design proof work that teaches the system something real
while moving the product forward. The proof should validate behavior through
native OpenClaw, Codex, and GBrain surfaces without becoming a separate
runtime.

## Core Rule

Choose proof work that is useful even if the proof result is boring.

A good proof advances a real roadmap item, closes a documented gap, or
calibrates a real operating workflow. It does not exist only to make a marker
appear.

## Proof Types

Name the proof type before choosing the task:

- substrate proof: proves a native surface exists and can be called;
- behavior proof: proves an agent follows its canonical loop;
- quality proof: proves the output is strong enough for downstream use;
- regression proof: proves a known failure no longer happens;
- end-to-end workflow proof: proves multiple agents/surfaces work together;
- operational readiness proof: proves the run is safe, observable, and
  repeatable enough for real use.

Many real proofs combine types. State the primary one so the selected work
matches the question being tested.

For source-backed analytical products, keep these proof classes distinct:

- transport proof: the request reaches the provider and returns faithfully;
- acquisition proof: the source operation retrieves the intended observable;
- method proof: the sampling and comparison can support the claimed inference;
- product-quality proof: the result helps the operator make the intended
  decision;
- operational-acceptance proof: the live system is safe, observable,
  repeatable, and policy-compliant.

One class cannot silently satisfy another. An HTTP 200 does not prove useful
intelligence, and a polished recommendation does not prove source coverage.

## Candidate-Slice Evaluation

Before recommending proof work, compare candidate slices against these
questions:

- Does this work advance a real objective?
- Is it naturally complex enough to test the behavior we care about?
- Is it bounded enough to avoid sprawl?
- Does it reward the desired agent behavior without prompting it?
- Does it land at the deepest native seam?
- Does it close a documented gap instead of deferring it?
- What would this proof still not prove?
- What is the cheapest bounded live falsification that could reject the
  method before a build, migration, or long end-to-end run?

Reject a candidate if it is only convenient, already solved, too small to test
the target behavior, or so broad that the agent must rediscover the whole
system.

Run method falsification at the owning boundary before committing to expensive
implementation. Use the actual installed client/provider shape when version,
auth, pagination, or runtime semantics matter. A fixture that reconstructs the
intended behavior is not a substitute for the installed boundary.

## No Self-Referential Proof Theater

Do not choose work that merely asks the system to prove itself.

Bad:

- "Prove Coding can delegate."
- "Produce a report about whether Planning can plan."
- "Run a proof of the proof harness."

Better:

- Pick a real implementation slice that naturally benefits from code
  exploration, implementation, tests, and review.
- Pick a real Business Ops onboarding record that downstream agents must use.
- Pick a real readback regression whose fix improves operator trust.

## Do Not Put The Answer In The Prompt

The prompt should ask for the outcome, not prescribe the hidden behavior being
tested.

When testing Coding team-shape judgment, do not mention subagents, delegation,
or role names. Let Coding decide whether solo work, a light scout, tests, or
review are worth the cost.

When testing Planning route judgment, do not force a fixed six-lane source
fanout. Ask for the plan and let Planning justify source routes.

When testing Business Ops usefulness, do not ask for a generic checklist.
Provide real intake and ask for a record that downstream agents can use.

## Native Architecture Boundary

Use native surfaces:

- OpenClaw `chat.send`, `task`, session transcript, and native event/readback;
- Codex-native coding team behavior inside Coding;
- GBrain page/timeline memory for durable summaries and pointers;
- repo artifacts and audit CSVs as bounded evidence.

Do not add:

- custom proof harness;
- planner engine;
- static DAG;
- deterministic parser gate;
- lifecycle state machine;
- runtime quality status;
- task projection as truth;
- GBrain as execution finality.

## Proof Prompt Shape

Keep the proof prompt outcome-focused:

```text
Use the system to complete <real objective>.

Requirements:
- preserve native architecture boundaries;
- produce the requested artifact/fix/record;
- include evidence, tests, review, and readback appropriate to the work;
- do not start execution before required approval.

Do not:
- use custom harnesses;
- create a new runtime truth layer;
- treat memory/readback projections as finality.
```

Only include lifecycle details that the operator truly wants for that proof.
If a behavior should always happen, put it in canonical agent docs or a skill
instead of smuggling it into the prompt.

## Review Criteria

Reviewer should reject proof designs when:

- the selected task is self-referential;
- the prompt contains the answer or route;
- the task is too small to prove the target behavior;
- the task is too broad to finish without context churn;
- the task does not advance real work;
- explicit operator intent was omitted or deferred without reason;
- the proof relies on a marker instead of artifact quality;
- the proof adds deterministic machinery to pass an agent-quality problem.

Reviewer should also ask:

- What does this proof prove?
- What does it not prove?
- What evidence would convince a skeptical operator?
- Which failure would be useful to learn from?
- Does the selected work fit the system's current architecture?

## Closeout

A useful proof closeout states:

- objective;
- proof type;
- selected slice and why;
- what made the slice non-self-referential;
- native surfaces used;
- prompt boundary;
- artifacts created or changed;
- tests/review/readback;
- what passed;
- what failed;
- what remains unproven.
