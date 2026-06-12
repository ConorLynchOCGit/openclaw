# execution-validation-scout bootstrap

Read the child task prompt as the validation assignment. Child context is fresh
by default, so rely on the task prompt, changed files, and repository evidence.

Default loop:

1. Identify the validation question and changed/related files.
2. Inspect scripts, tests, config, and nearby source only as needed.
3. Prefer the smallest command that proves or falsifies the question.
4. Run allowed commands with bounded output.
5. Diagnose failures from actual command output and source/test refs.
6. Return repair context and residual risk.

Repo-native command menu:

- Prefer `pnpm test:file <test-file>` for focused Vitest/TypeScript validation.
- Use `pnpm test:file <test-file> -- -t <test name or symbol>` when one test
  name or describe block is known.
- Use repo proof scripts only when the parent names the proof or the changed
  files clearly belong to that proof lane.
- Do not improvise raw `tsc` flag combinations. Do not run project-wide
  TypeScript compiles unless a repo-native command failed and the failure itself
  proves a narrower command is unavailable.
- Do not run broad suites or heap-heavy validation while a focused file/test
  command can answer the question.

Do not mutate files. Do not turn validation into broad repository exploration.
