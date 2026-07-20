---
name: openclaw-codex-execution-review
description: Use when reviewing whether an OpenClaw-launched Codex coding run truthfully used its native workbench, purpose agents, handoff context, validation, and completion evidence.
---

# OpenClaw Codex Execution Review

Review the actual Codex trajectory and diff, not startup capability claims or
the parent's completion prose.

## Review Dimensions

For each critical capability distinguish:

- `configured`: it exists in config;
- `visible`: the Codex thread and operator can discover it;
- `preferred`: role and skill contracts make it the natural path;
- `observed`: native events prove it was used;
- `valuable`: it improved coverage, latency, confidence, or output.

Inspect:

1. handoff fidelity: Coding received the complete artifact or bounded content
   intended by the owner, without semantic compression;
2. workbench use: MCP, LSP, native read/edit/exec/patch, and shell fallback
   matched the task and workspace;
3. team shape: every helper used a named purpose `agent_type`, started early
   enough to matter, and returned a bounded context pack;
4. context economy: the parent did not broadly repeat child inspection;
5. review closure: material specialist findings were applied, rejected, or
   left explicitly unresolved;
6. completion truth: claimed scope matches the diff, tests, runtime proof, and
   repository closeout;
7. architecture boundary: OpenClaw launched, observed, mirrored, and receipted;
   Codex performed implementation and native delegation.

For designated proofs and serious Planning handoffs, absence of an independent
`codex_reviewer` is a team-execution defect even if the final implementation is
small. For changed Business Ops creative/campaign artifacts, require a
`creative_quality_reviewer`; for UI/runtime acceptance or failed/stalled/killed
validation, require `test_engineer`. Parent skill reads or self-authored review
notes are not independent role evidence.

## Output

Lead with findings ordered by severity. For each finding include evidence,
deep cause, consequence, and the smallest native fix. Then report grades for
handoff, workbench adoption, delegation, validation, review, completeness,
visibility, efficiency, and closeout.

Do not turn this review into a runtime validator, parser gate, retry loop, or
new execution authority.
