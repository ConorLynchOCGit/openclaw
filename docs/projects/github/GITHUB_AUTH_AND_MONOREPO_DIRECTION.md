# GitHub Auth And Monorepo Direction

## Status

This project note tracks two linked workspace-structure follow-ups:

1. fix GitHub auth on this VPS so maintainer PR and landing workflows can run
   cleanly from the host
2. move toward a single OpenClaw monorepo posture instead of the current
   multi-repo setup that is creating confusion

## Current Problem

- GitHub auth on this VPS is not in a clean maintainer-ready state
- branch push coverage exists, but the full landing and PR-management path is
  not reliable enough from this host
- OpenClaw-related work is currently spread across multiple active repos
- that repo split is creating ambiguity about:
  - canonical workspace vs seed/bootstrap copies
  - where landing should happen
  - where operational docs belong
  - where long-lived project coordination should live

## Decision Direction

- repair GitHub auth on the VPS as a first-class infrastructure task
- define a monorepo direction for OpenClaw-related work instead of continuing to
  tolerate repo sprawl
- treat workspace and GitHub structure cleanup as an explicit project family,
  not as incidental cleanup

## Working Assumption

The current active setup appears to involve roughly three OpenClaw-related repos
or repo surfaces in active use. That exact inventory should be confirmed during
the auth and workspace-structure cleanup work, but the direction is to reduce
that confusion into one canonical monorepo posture.

## Next Steps

- audit the current GitHub auth path on this VPS
- document the exact missing capability for PR creation, review, and landing
- inventory the currently active OpenClaw repos and their roles
- define the target monorepo boundary and what remains outside it, if anything
- plan the migration so canonical workspace, repo landing, and operational docs
  all point at one authoritative home
