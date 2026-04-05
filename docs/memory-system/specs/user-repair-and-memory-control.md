# User Repair And Memory Control

## Purpose / user problem

As memory becomes broader and more semantic, users need a normal product path
to repair wrong memory instead of depending on operators or hidden internals.

## Why this belongs in the memory system

Without strong repair controls, any broadened detection system will feel risky
and sticky to users.

## Non-goals

- general-purpose memory browsing UI in v1
- retroactive rewriting of historical evidence
- operator-only backdoor tooling

## Architecture fit

This feature should build on existing:

- correction capture
- supersede behavior
- review / promotion

It must not bypass:

- provenance
- approved/candidate distinction
- safety review for risky deletions or broad forget actions

The locked v1 posture is:

- conversational repair first
- no full memory inspection UI in v1
- no lightweight inspection command/tool required before the first semantic
  slices
- leave room for a later lightweight inspection surface if targeting proves too
  opaque in practice

## Domain model / concepts

Support bounded user-visible control intents such as:

- correction
- supersede
- forget this
- do not remember this
- stop applying this remembered behavior

The first implementation should treat conversational repair as the primary
user-facing control surface.

## Bounded scope for first implementation

First implementation should target:

- response-style memory
- supported project facts
- recurring procedures only where lineage is clear

First implementation should not require:

- a full memory browser
- a memory-management dashboard
- a broad "show me everything you remember" surface

## Exact input / output behavior

Inputs may include turns like:

- correction of a remembered value
- explicit forget instruction
- explicit do-not-remember instruction
- explicit stop-applying instruction

Representative examples:

- "No, use bullet points, not numbered steps."
- "Forget that plain-English preference."
- "Do not remember that project URL."
- "Stop using my old deploy checklist."
- "That only applies to project Atlas."

Outputs may include:

- corrected candidate
- supersede of an older approved item
- immediate bounded repair action
- explicit prompt-now confirmation for risky but targetable actions
- explicit no-op when the request is too broad or unsafe

The v1 system should support these repair actions conversationally:

1. `correct`
   - replace or narrow a remembered value for a supported subject
2. `supersede`
   - make a newer supported memory outrank or replace an older one
3. `forget`
   - request that a supported remembered item stop being used
4. `do_not_remember`
   - request that a just-seen or candidate memory not be retained
5. `stop_applying`
   - request that an otherwise valid memory stop affecting replies

Targeting rules:

- if the user explicitly names the subject, use that subject
- if the immediately preceding assistant behavior clearly reveals the target,
  conversational deictic targeting such as "that" or "that preference" is
  allowed
- if multiple plausible targets exist, clarify instead of guessing
- if no supported target can be resolved, no-op or refuse safely

## Candidate vs approved behavior

- bounded low-risk corrections may continue to use the established correction
  promotion path
- clear low-risk forget/remove actions should resolve immediately
- risky but targetable forget/remove actions should use `prompt_now`
- unsupported broad forget/remove requests should refuse, narrow, or expire;
  they must not become a dead review queue
- conversational repair should work against both:
  - currently applied approved memory
  - recent candidate memory where lineage is clear
- risky broad forget requests must not directly delete or disable multiple
  memories just because they sound conversational

## Provenance / metadata requirements

Every repair action should record:

- the targeted prior memory
- the repair type
- the source user turn
- whether the repair was:
  - correction
  - supersede
  - forget request
  - do-not-remember request

When target resolution relied on conversational context, also record:

- resolution basis:
  - explicit subject name
  - recent applied memory
  - recent candidate lineage
  - prior assistant behavior reference

## Retrieval / application behavior

Once a repair is approved, later behavior application must stop using the old
memory according to the bounded rules of that family.

The behavior-application layer should expose enough applied-memory context that
conversational repair can target "what you are currently using" without
requiring a full inspection UI.

In v1, this should be implemented through internal provenance and applied-profile
metadata, not a user-facing inspection screen.

## Ambiguity / abstain / clarify rules

- if the target memory is unclear, clarify
- if the user request is too broad, refuse or downgrade to review
- do not guess which memory to delete when multiple plausible targets exist
- if the user says "forget that" and there is a single strong recent target,
  clarifying may be skipped
- if the user says "forget everything like that" or similarly broad language,
  refuse or narrow rather than guessing intent

## User repair / supersede / forgetting implications

This spec is itself the user repair/control layer.

The core promise is:

- users can predictably fix or deactivate wrong memory

The v1 promise is not:

- full self-serve browsing of all memory
- bulk memory management
- arbitrary historical memory editing without lineage

## Observability / metrics / audit requirements

Track:

- repair requests by type
- approved vs rejected repairs
- clarify rate for repair attempts
- repeated repairs against the same subject
- repair target-resolution success rate
- deictic repair success rate for turns like "forget that"

## Evaluation / proof requirements

- prove that repaired memory stops affecting later replies
- prove that unclear forget requests do not delete the wrong thing
- prove at least one conversational deictic repair case
- prove at least one explicit subject-named repair case
- prove at least one broad unsafe forget request is refused or narrowed
- prove risky-but-clear forget actions use prompt-now rather than background
  review

## Rollout posture

- off-production first
- production only after response-style repair works cleanly

## Risks / failure modes

- wrong memory targeted for deletion
- user says “forget that” and system cannot determine scope
- repair semantics differ across families
- lack of user inspection makes repair targeting feel opaque if applied-memory
  context is not surfaced clearly enough in logs and assistant behavior

## Locked v1 decision

The first user-facing repair surface is conversational.

This means:

- users repair memory by telling OpenClaw naturally
- no full memory inspection UI is required in v1
- no lightweight inspection command/tool is required before the first semantic
  slices ship

## Open questions

- when a later lightweight inspection surface is added, should it show:
  - currently applied memory only
  - or a broader bounded remembered-state view?
