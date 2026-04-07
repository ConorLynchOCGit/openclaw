# Self-Improving-Agent Adoption Plan

## Purpose

This document translates the vetting result for `self-improving-agent` into a
concrete repo-native adoption decision.

It answers whether the skill should be:

- installed as-is for narrowly constrained use
- wrapped by repo-owned guidance and guardrails
- forked or adapted before installation
- or deferred until the custom memory middleware plugin base exists

## Inputs

This plan is based on:

- `docs/memory-system/SKILL_PROCUREMENT.md`
- `docs/memory-system/SELF_IMPROVING_AGENT_INTEGRATION.md`
- `docs/memory-system/SELF_IMPROVING_AGENT_VETTING.md`
- `docs/memory-system/specs/self-improving-capture-integration.md`

## Adoption analysis

### Acceptable parts of the reviewed skill

The following parts are directionally compatible with this repo's architecture:

- candidate learning capture
- correction capture suggestions
- procedure-adjacent suggestions
- improvement-note generation
- a general reminder that non-obvious learnings should be reviewed rather than
  lost

These fit the intended accelerator role described in the memory-system docs.

### Unacceptable parts of the reviewed skill

The following parts are not acceptable as-is in this architecture:

- direct `.learnings/` file logging as the primary durable substrate
- direct promotion guidance into `AGENTS.md`, `TOOLS.md`, `SOUL.md`, and
  `MEMORY.md`
- optional hook enablement that changes session behavior broadly
- skill-extraction flows that create new skills outside the repo-native
  promotion and vetting model
- assumptions that file-backed learning is the main system of record

These behaviors conflict with:

- the planned context-plane and knowledge-plane split
- reviewed promotion from candidate memory to approved memory
- policy-gated durable memory
- the requirement that external skills remain accelerators only

## Wrapper-guidance assessment

Wrapper guidance alone is not sufficient.

Reason:

- the current reviewed skill ships its own behavioral instructions, hook
  workflow, and file-promotion model
- even with strong wrapper docs, installing the raw package would still place a
  broader learning loop and hook surface on disk
- the repo would still carry ambiguity about which workflow is authoritative

Wrapper guidance is still useful, but only as part of a more constrained
adoption path.

## Fork or adaptation assessment

A fork or adaptation is likely needed if this skill is adopted later.

The minimal adapted version should strip or neutralize:

- hook enablement guidance
- direct promotion to control files
- raw file-first memory authority assumptions
- skill-extraction behavior as a default path

The retained subset would focus only on:

- candidate learnings
- correction capture suggestions
- procedure-adjacent candidate suggestions
- improvement notes

## Plugin-base dependency assessment

Installation should wait until the custom memory middleware plugin base exists.

Reason:

- the plugin base is the clean place to define repo-native tool boundaries
- it provides the right seam for candidate-only capture behavior
- it reduces ambiguity between external-skill guidance and canonical memory
  behavior
- it avoids blessing file-first learning loops before the actual middleware
  surface exists

Without the plugin base, the repo cannot yet translate `self-improving-agent`
outputs into a stable repo-native substrate cleanly.

## Allowed behaviors for any future constrained adoption

If adopted later, `self-improving-agent` may be allowed to:

- generate candidate learnings
- suggest correction captures
- suggest procedure candidates
- generate improvement notes
- operate only on bounded reviewed inputs

## Blocked behaviors for any future constrained adoption

If adopted later, `self-improving-agent` must still be blocked from:

- becoming the canonical durable memory store
- direct writes to policy memory
- direct promotion to approved memory or approved procedures
- direct writes to `AGENTS.md`, `TOOLS.md`, `SOUL.md`, or `MEMORY.md`
- hook enablement by default
- broad autonomous behavior
- procurement or installation of other skills

## Required guardrails

Any future adoption must include:

1. candidate-only output handling
2. no hook activation
3. no direct writes to authoritative workspace memory or policy files
4. review before any promotion
5. clear separation between accelerator output and canonical backend state
6. repo-owned integration guidance that supersedes the upstream default posture

## Recommended adoption path

Recommended path:

1. finish the custom memory middleware plugin base
2. define the candidate-only capture seam
3. define how reduced-profile output merges into the generalized lesson
   clustering and auto-review pipeline
4. if still useful, fork or adapt `self-improving-agent` into a reduced
   profile aligned with that seam
5. only then consider limited installation of the reduced version

## Explicit recommendation

Recommendation: `defer until plugin base exists`

Supporting judgment:

- do not install the raw upstream skill now
- do not rely on wrapper guidance alone
- expect a fork or adaptation to be needed later if adoption proceeds

## Install decision for this slice

`self-improving-agent` is **not installed** in this slice.

## Implementation notes

This slice establishes the adoption decision only.

Still pending:

- plugin base implementation
- broader adoption decisions beyond the now-implemented candidate-only
  integration seam
- any future decision to let advisory proactive planning consume or react to
  reduced-profile self-improving candidate output still remains repo-native
  and read-only in the current implementation
- the new bounded proactive execution slice does not change that posture;
  reduced-profile self-improving output still has no direct proactive
  execution path
- the new bounded background-job scheduling slice also does not change that
  posture; reduced-profile self-improving output has no direct background-job
  scheduling or execution path
- reduced-profile implementation details now specified in
  `docs/memory-system/SELF_IMPROVING_AGENT_FORK_SPEC.md`
