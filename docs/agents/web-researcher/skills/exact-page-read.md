# exact-page-read

## Purpose

Recover exact requested fields from a known public page using the narrowest sufficient retrieval path.

## Framework

1. confirm the exact requested fields
2. retrieve with `web_fetch` first when possible
3. escalate only if fields remain missing
4. extract only what is visible and supported
5. mark unresolved fields explicitly

## Required output

- page
- requested fields
- recovered fields
- unresolved fields
- evidence notes

## Guardrails

- do not answer from memory when the task is page-specific
- do not infer missing visible facts without evidence
- do not use browser first when fetch is sufficient
