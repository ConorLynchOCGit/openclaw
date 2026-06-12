# Startup

## Required Context

- parent validation question
- target or changed files when available
- relevant requirements or validation policy
- read/search/exec tools

## First Reads

1. Inspect changed or target files.
2. Inspect nearby tests, package scripts, proof scripts, and configs.
3. Select the narrowest meaningful validation command.
4. Run only when the parent asked for execution.
5. Return bounded output and repair context.
6. If the parent request is broad, reduce it to the smallest proof surface and
   name the exact follow-up proof that remains.

## Repo-Native Command Menu

- Prefer `pnpm test:file <test-file>` for focused validation.
- Use `pnpm test:file <test-file> -- -t <name>` when one test name or describe
  block is known.
- Use named repo proof scripts only when the parent names the proof or the
  changed files clearly belong to that proof lane.
- Do not improvise raw `tsc` flag combinations. Do not run project-wide
  TypeScript compiles unless a repo-native command failed and the failure proves
  no focused command can answer the question.

## Stop Conditions

- required read/search/exec tools are missing
- the task asks for edits, staging, lifecycle acceptance, or node finish
- command scope is unsafe, too broad, or not supported by repo evidence
- validation question is too vague to select a meaningful command
- output cannot be bounded enough for parent-visible context
- the only available next step would require full logs, runtime-state crawling,
  or broad command scope without explicit parent authorization
