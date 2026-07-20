---
name: agentic-architecture-review
description: Use when designing, reviewing, or refactoring OpenClaw/Codex/GBrain agent architecture, agent teams, canonical docs, skills, orchestration, context handoff, delegation, proof design, reviewer rubrics, runtime readback, or native-fit decisions.
---

# Agentic Architecture Review

Use this skill to keep agent/team architecture powerful, native, and simple.
It is a qualitative reasoning aid, not a runtime gate, parser, workflow engine,
or second canonical architecture system.

## Native Authority Model

Prefer the native owner for each concern:

- OpenClaw owns outer orchestration, sessions, tasks, events, approvals,
  runtime readback, and deployment/controller surfaces.
- Codex owns coding implementation, Code Mode, custom agents, subagents,
  model profiles, tool execution, and validation inside Coding.
- GBrain owns durable memory, concise summaries, decisions, lessons, and
  pointers to repo/runtime artifacts.
- Repo artifacts own detailed plans, specs, proofs, Business Ops records, and
  implementation records.
- Skills own reusable reasoning procedures.
- Reviewer owns critique and quality judgment, not finality.

Treat task rows, session summaries, CLI/UI projections, and GBrain summaries as
read models unless the native runtime source says otherwise.

When judging "native", prefer surfaces that come from the upstream checkout or
the platform's existing extension points. A local OpenClaw patch can be native
only when it lands inside the owning OpenClaw module and preserves the existing
authority model. Do not call a wrapper, sidecar, proof runner, ledger loop, or
parallel controller "native" merely because it lives in the repo.

## Deepest-Seam Rule

For every proposed fix, identify the deepest native seam that preserves the
desired behavior with the fewest moving parts.

Use this ladder:

1. existing native config or runtime setting;
2. canonical agent instruction or skill;
3. source-lane brief/template;
4. existing OpenClaw/Codex/GBrain tool or extension point;
5. small source patch at the owning module;
6. new subsystem only after the native seams are ruled out with evidence.

Reject fixes that add a parallel authority surface when the native seam can
carry the behavior.

## Batch-First Execution

For large architecture goals, do not let ledgers or proof rows become the
scheduler.

Use this cadence:

1. batch related source/doc/test work by architecture seam;
2. run focused local validation;
3. build or promote once when runtime proof is needed;
4. run one consolidated proof for the batch;
5. update ledgers and proof episode records from the consolidated evidence.

Reject this cadence unless a real runtime/safety blocker requires it:

```text
small edit -> ledger row -> build/smoke/promote -> narrow proof -> row update
```

Ledgers, proof episode records, and quality audits are evidence sinks and
review inputs. They are not task runners, deterministic gates, or reasons to
interrupt coherent feature work.

Before evidence or proof commits, inspect the staged scope with cached diff
stat and name-status. Use explicit pathspec commits for scoped work. Commit the
whole index only when intentionally sealing an accumulated backlog, and say so
in the closeout. Raw transcripts, logs, validation payloads, and task dumps
belong behind artifact pointers or compact manifests.

## Manager / Specialist Pattern

Use manager-style orchestration for complex work:

- parent interprets intent and owns the final answer;
- parent selects specialists only when their source lane can change a decision;
- child returns evidence, refs, risks, constraints, and inspect-next leads;
- parent inspects or downgrades implementation-driving claims;
- reviewer critiques the actual draft or diff;
- parent applies, rejects, downgrades, or routes reviewer P1s.

Children do not own final synthesis unless the parent explicitly hands off the
entire domain responsibility.

For operator-facing orchestration, separate sequence ownership from domain-work
ownership. Main owns intent preservation, routing, approval mediation, and
presentation. The domain owner owns the substantive work inside its lane:
Planning owns planning artifacts and source-lane models, Coding owns
implementation/team shape, Business Ops owns business records, Operations owns
runtime/deploy actions, and Reviewer owns critique. If Main performs a domain
owner's missing synthesis because the domain output was thin, the architecture
has blurred ownership and should be routed back rather than normalized.

## OpenClaw Versus Codex Delegation

Use OpenClaw `task` for foreground domain-agent delegation where Main,
Planning, Business Ops, Reviewer, or source-shaped OpenClaw agents need to
return evidence before the parent answers.

Use Codex-native custom agents inside Coding. Main and Planning should not name
Coding's internal Codex roles for the operator. They may tell Coding to use its
canonical Coding strategy. Coding then decides solo versus child agents and
reports its rationale.

Use raw `sessions_spawn` or `sessions_yield` only when the work is explicitly
async, persistent, or background-shaped. Do not replace ordinary foreground
manager/specialist delegation with a custom fanout queue.

## Context Handoff

Prefer Context Packs and Implementation Context Packs over transcript dumps.

A strong packet contains:

- 5-10 decision-changing findings;
- exact source refs;
- concrete details;
- planning or implementation implication;
- constraints, risks, contradictions, and opportunities;
- inspect-next refs;
- confidence or caveat;
- stop rationale.

Parent must treat child output as evidence leads, not proof. If a claim changes
architecture, implementation order, risk, acceptance, or validation, the parent
must inspect the source ref or downgrade the claim.

## Context Economy

Grade trajectory as well as final output.

After the first viable P1/P2 set, every extra read/search/tool call should be
able to say how it could change the parent decision. Continue only when the
next source could:

- contradict a P1;
- change implementation order;
- reveal a blocker;
- identify owner file/test/config;
- materially downgrade confidence;
- expose native/non-native architecture risk.

Otherwise stop and put leads under inspect-next.

For proof/spec repositories, do not use broad searches that traverse raw
source-validation, transcript, task-list, or retained proof payloads unless
those payloads are the actual target and the output is capped. Prefer exact
ledger-row extraction, owner-file reads, compact manifests, artifact pointers,
and small line ranges. Context economy includes evidence-gathering trajectory,
not only child-agent output.

## Proof Design

Useful proofs advance real roadmap, architecture, product, or operational work.

A proof should state:

- proof type: substrate, behavior, quality, regression, readiness, end-to-end;
- real work advanced;
- behavior signal expected;
- validation surface;
- native architecture boundary;
- what the proof will not prove;
- reviewer quality criteria.

Avoid self-referential proof theater. Do not put the expected route or answer
in the operator prompt. If testing delegation, choose work that naturally
benefits from delegation rather than asking the operator to request it.

For major upgrade goals, prefer one larger end-to-end proof after meaningful
work has accumulated. Do not prove every small intermediate field unless the
runtime is broken, data is at risk, or local validation cannot give useful
confidence.

Use native session, task, transcript, trajectory, and stream readback as
operator optics over native evidence. Do not let readback tools become
lifecycle truth, proof runners, or quality gates.

## GBrain Discipline

Use GBrain as continuity, not runtime truth.

Good GBrain writeback:

- concise page or timeline summary;
- link to full repo artifact;
- current-state decision;
- top recommendations;
- risks/watch items;
- next action;
- source pointers.

Do not put raw transcripts, raw logs, provider prompts, hidden reasoning,
runtime state, or full scout dumps into GBrain.

## Skill Lifecycle

Promote repeated behavior into a skill when more than one agent needs it, it is
used in proofs, it is relied on for acceptance, or docs-only guidance keeps
failing.

For major skills, require:

- clear trigger language in frontmatter;
- owner or owning agent surface;
- proof of use or behavior following the skill;
- stale/duplicate skill review during major agent architecture work;
- retirement or reconciliation when a workflow doc and skill overlap.

Keep lifecycle lightweight. Do not create a second skill-governance system,
parser, or approval engine around skills.

## Anti-Patterns

Block or redesign when the proposal:

- adds a planner engine, static DAG, parser gate, task bus, lifecycle overlay,
  deterministic quality status, hard timeout choke, or custom proof harness;
- turns GBrain, Work Queue, task rows, compact readback, or UI state into
  execution truth;
- builds a parallel runner for behavior agents can handle through native tools;
- duplicates the same workflow in canonical docs and skills without a clear
  owner;
- narrows a prompt around one proof instead of fixing canonical behavior;
- lets Main compensate for a domain owner by authoring the missing planning,
  implementation, Business Ops, operations, or review artifact;
- runs parallel Main-owned and domain-owner-owned source models for the same
  planning objective instead of letting Planning own source ROI;
- lets ledgers drive implementation cadence;
- repeatedly rebuilds/promotes after tiny edits when local validation and
  batching would be enough;
- creates schemas to choke model judgment where qualitative review is needed;
- hides stale/current-state failures behind best-practice lists;
- solves readback by creating another finality surface;
- expands roles/tools before proving the current team shape is insufficient.

## Review Output

Return this block:

```markdown
## Verdict

## Native Owner

## Deepest-Seam Assessment

## Delegation / Context Handoff

## Moving Parts To Remove

## Architecture Findings

- Severity:
  Issue:
  Native alternative:
  Required change:

## Proof Required

## Residual Risk
```
