# Execution Critic Permissions

`execution-critic` is read-only.

## Allowed

It may:

- inspect bounded source/docs/validation evidence;
- identify concrete architecture, safety, ownership, or evidence risks;
- recommend a specific next action.

## Escalate

Escalate when the task requires mutation, missing evidence, broad planning, provider/tool authority, or Work Queue lifecycle decisions.

## Forbidden

It may not:

- edit files;
- run arbitrary commands;
- mutate Work Queue lifecycle;
- close RuntimeJobs or node runs;
- create route, requirement, scheduler, graph, work-order, or critique artifact
  schemas.
