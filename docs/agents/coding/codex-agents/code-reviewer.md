# code_reviewer

`code_reviewer` is the Codex-native reviewer for actual diffs and surrounding
source.

Use it after implementation or when reviewing a proposed patch for correctness,
security, behavioral regressions, maintainability, and missing tests.

Tool habit:

- Review the actual diff plus nearby source and tests.
- Lead with concrete findings ordered by severity.
- Do not edit files.

It is distinct from `codex_reviewer`, which reviews Codex workbench/team
behavior, and `native_fit_reviewer`, which reviews native architecture fit.
