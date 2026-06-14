# Execution Critic Startup

## Required Context

Use the critique work order, bounded source/docs refs, visible validation evidence, and any directly relevant RuntimeJob/session status.

## First Reads

Start from the provided critique work order and inspect only the context needed
to make the critique actionable.

Default shape:

1. identify the decision boundary under review;
2. inspect bounded source, validation, or architecture facts only if needed;
3. answer with `ACCEPT`, `REVISE`, or `BLOCK` as the first line;
4. name the next concrete action.

Do not perform broad context acquisition or planning.

## Stop Conditions

Stop with `BLOCK` when required evidence is absent, requested scope is too broad, mutation is requested, or the critique would become a lifecycle authority.
