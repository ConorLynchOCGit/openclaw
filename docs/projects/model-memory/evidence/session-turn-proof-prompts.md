# Session Turn Proof Prompts

## 1. Ingestion Quality Phase

- Prompt ID: prompt-001-ingestion-quality-phase
- Selection reason: Direct request to move from architecture to ingestion quality and downstream proof.

```text
We now need to thoroughly test document ingestion with the new features, including human adjudicated test output. Then we should push through testing all of the other features in the memory / context engine / cache stack.
```

## 2. Stage Visibility Request

- Prompt ID: prompt-002-agents-stage-visibility
- Selection reason: Explicit instrumentation request with concrete model and scope constraints.

```text
We need to determine why the writes aren't happening. We need to see granular emission at each stage - each window and each stage (pass 1, pass 1 repair, pass 2, pass 2 repair). And we need to know that the prompt was submitted successfully, and that the model actually returned a result. Lets focus all of our testing JUST on agents.md for now. Lets start with GPT 5.4 nano on both passes because we know its the fastest model.
```

## 3. Collision Adjudication Efficiency

- Prompt ID: prompt-003-bounded-collision-question
- Selection reason: Direct architectural question about deterministic gating versus model adjudication.

```text
"every write candidate runs bounded collision adjudication" if we are doing search and match and then duplicate adjudication deterministically later, why do we need to have each object with its own model prompt doing bounded collision adjudication? That is not efficient.
```

## 4. Batched Residual Adjudication Spec

- Prompt ID: prompt-004-batched-residual-spec
- Selection reason: Rich operator instruction about spec, docs, and batched adjudication tradeoffs.

```text
Write a spec for this: " If you want, I can next turn this into a concrete deterministic gate for collision recall so the write path only calls the model on the small ambiguous remainder instead of all 18." Update the docs with it. We should explore adjudicating ALL of the remaining objects in a single pass. That reduces to one additional model call on a tiny set of objects. If resolution on it isn't perfect, I think we have to accept memory loss vs trying to over optimize for perfect capture or risk allowing extra junk into the db. Then write the prompt for building that adjudication change and for the next Agents.md test.
```

## 5. Priority Top 10 Ingestion

- Prompt ID: prompt-005-priority-top10
- Selection reason: Simple imperative ingestion request from the same project lane.

```text
Pick a basket of 10 documents from the top of our priority ingestion list. Run ingestion on those.
```

## 6. Nano Default Posture

- Prompt ID: prompt-006-nano-default
- Selection reason: Clear default-runtime policy instruction with documentation and code impact.

```text
Just to be clear - the default for ALL runs and all versions of the system should be nano/nano not mini. Adjust any documentation or actual code that has mini as teh default for any passes.
```

## 7. Revised Proof Standard

- Prompt ID: prompt-007-updated-proof-standard
- Selection reason: High-level proof-standard question that should surface durable policy claims if the turn lane works.

```text
Rerun stable will never be true because of model constraints. If we accept that limitation on the model, what is a reasonable updated proof standard?
```

## 8. Remaining 121 Population

- Prompt ID: prompt-008-remaining-121
- Selection reason: Direct operator request for large-batch ingestion execution.

```text
Run the document ingestor across the remaining 121 documents we haven't read yet.
```

## 9. Callable Tool Surface

- Prompt ID: prompt-009-tool-surface-question
- Selection reason: Operator-facing product question about the new ingestion surface.

```text
Is the document ingestor now a callable tool in OpenClaw? I know the framework was built.
```

## 10. Tool Registration And Turn Proof

- Prompt ID: prompt-010-tool-and-turn-proof-request
- Selection reason: Current operator request that combines tool registration with turn-ingestion proof.

```text
Do this: "  If you want this to be callable from OpenClaw itself, the next step is to add one of these surfaces: - an agent tool registration in the clean-room package". Then we need to do some test runs of the prompt/turn ingestion lane. I want you to take 10 prompts I have actually given you in this session and test them with the system. Write the strict prompt for the above.
```
