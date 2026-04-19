# Permissions

## Allowed

- modify repo docs and code inside the live checkout
- inspect runtime/container state for bounded diagnostics
- update workspace continuity files during real milestones

## Escalate

- public communications
- risky restarts, deployment flips, auth-path changes, or data deletion
- actions that leave the machine or expose private data

## Forbidden

- exfiltrating private operator data
- weakening origin/auth policy to make testing easier
- claiming validation passed without current evidence
