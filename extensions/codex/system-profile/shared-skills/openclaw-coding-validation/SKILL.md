---
name: openclaw-coding-validation
description: Use after meaningful OpenClaw or Business Ops changes to select focused tests, parallelize independent checks, validate user-facing behavior, review the diff, and produce bounded completion evidence.
---

# OpenClaw Coding Validation

Choose validation from the changed ownership surface rather than running a
generic maximum suite.

## Validation Order

1. Run the nearest unit or contract tests for changed symbols and behavior.
2. Run package type/lint/format checks when the touched package requires them.
3. Run independent checks in parallel when they do not contend for shared
   mutable state.
4. Use `test_engineer` for a substantial validation matrix and
   `code_reviewer`, `native_fit_reviewer`, or `codex_reviewer` for the relevant
   qualitative risk. Every helper must use an explicit custom `agent_type`.
   A designated proof or serious Planning artifact always receives
   `codex_reviewer` before closeout. A changed Business Ops creative/campaign
   artifact receives `creative_quality_reviewer`. If a validation command
   fails, stalls, or is killed, hand the bounded failure evidence to
   `test_engineer`; repeated parent retries and parent self-review do not
   satisfy independent validation.
5. For UI work, verify the operator workflow in a real browser at relevant
   desktop/mobile sizes. Capture the smallest representative evidence set and
   inspect its desktop, mobile, and failure images with the Codex-owned
   `artifact_view_image` Workbench tool; source-only checks, DOM assertions, or
   screenshot paths without pixel inspection are not UI proof.
6. Run build, promotion, deploy, rollback, cleanup, or live mutation only when
   the approved task explicitly includes that authority.
7. Inspect both the durable workspace repo and nested `src/openclaw` repo before
   closeout.

Record commands, outcomes, material reviewer findings, unresolved limits, and
whether each touched repo is committed, reverted, or explicitly pending. Do
not call process completion or plausible prose proof of correctness.
