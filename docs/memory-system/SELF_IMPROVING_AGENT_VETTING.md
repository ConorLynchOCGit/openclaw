# Self-Improving-Agent Vetting Record

## Purpose

This document records the formal vetting result for the first intended external
learning-oriented skill candidate: `self-improving-agent`.

This is a procurement record, not an installation record.

## Candidate

- Skill: `self-improving-agent`
- Source type: GitHub-hosted skill in `openclaw/skills`
- Source path: `skills/1215656/1215656-self-improving-agent-3-0-6`
- Source repo: `openclaw/skills`
- Reviewed repo commit: `32f13409b7ccc2f7072364b8b8c3967759e0ee66`
- Repo last updated at review time: `2026-04-01T04:11:00Z`
- Files reviewed: `13`

## Purpose and scope

The reviewed skill is designed to capture:

- learnings
- errors
- corrections
- feature requests

It also includes:

- optional OpenClaw hook support
- extraction scripts for turning learnings into skills
- guidance for promoting learnings into workspace or agent-control files

That means its scope is broader than simple note capture. It reaches into:

- workspace learning logs
- optional hook activation
- promotion into `AGENTS.md`, `TOOLS.md`, `SOUL.md`, `MEMORY.md`, or similar
  files
- skill extraction workflows

## Permissions and risk surface

### Files

The documented workflow expects writes to:

- `.learnings/LEARNINGS.md`
- `.learnings/ERRORS.md`
- `.learnings/FEATURE_REQUESTS.md`
- potentially promoted targets such as `AGENTS.md`, `TOOLS.md`, `SOUL.md`,
  `CLAUDE.md`, `.github/copilot-instructions.md`, and similar control files

### Commands

The reviewed package includes or documents:

- `openclaw hooks enable self-improvement`
- optional shell scripts for reminders and error detection
- a skill extraction helper that creates skill directories under a relative
  `./skills` path
- installation examples using `clawdhub install` or `git clone`

### Network

The skill code reviewed does not itself perform hidden network calls.
The documented installation examples include network-backed install paths, but
the shipped hook handlers and scripts reviewed do not exfiltrate data.

### Risk level

`🟡 MEDIUM`

Reason:

- no immediate credential theft or exfiltration pattern was found
- but the skill has a broad write and promotion posture that can reshape
  workspace control files and prompt surfaces if adopted without constraints

## Suspicious patterns and red flags

### No immediate critical red flags found

The review did not find:

- hidden network exfiltration
- credential harvesting
- obfuscated code
- `eval` or external-input execution
- base64 decoding tricks
- sudo or privilege-escalation requests

### Material concerns

The reviewed skill does contain behaviors or assumptions that are problematic
for this repo's architecture if left unconstrained:

1. It assumes direct logging to `.learnings/` as a primary durability path.
2. It explicitly encourages promotion into workspace or agent-control files such
   as `AGENTS.md`, `TOOLS.md`, `SOUL.md`, and `MEMORY.md`.
3. It includes optional hook activation that injects reminder behavior into
   sessions.
4. It includes a skill-extraction helper that creates new skills from learned
   patterns.
5. It is built around a file-backed learning loop rather than the planned
   structured memory middleware and review pipeline.

These are not outright security violations, but they are architecture and
governance concerns.

## Operational fit with this repo and architecture

### Positive fit

The skill aligns with the memory-system effort in that it can help with:

- candidate learnings
- correction capture
- procedure-adjacent suggestions
- improvement-note generation

### Negative fit

The skill conflicts with the current design if used naively because it pushes
toward:

- file-first durable memory
- direct promotion into control files
- automatic or semi-automatic learning capture loops

The memory-system design for this repo requires:

- candidate memory before approved memory
- reviewable promotion
- policy gating
- clear separation between accelerator outputs and canonical memory state

## Accelerator-versus-substrate check

Under this repo's policy, `self-improving-agent` must remain an accelerator and
not the canonical memory substrate.

The reviewed skill conflicts with that rule by default because its guidance
encourages a direct learning and promotion loop through local files.

That conflict is manageable only if the skill is constrained to:

- suggestion generation
- candidate learning capture
- bounded evaluation inputs
- no direct overwrite of policy or memory authority surfaces

## Approval recommendation

Recommendation: `approve for limited use`

### Rationale

This is not a rejection because:

- the reviewed code does not show obvious malicious behavior
- the skill is useful as a learning-oriented accelerator
- its outputs can support candidate learnings, corrections, and procedure
  suggestions

This is not normal approval because:

- its default posture is too broad for the repo's memory architecture
- it assumes direct writes and promotion to control files
- it blurs the line between candidate learning and canonical durable memory
- hooks and file-promotion behavior need tighter constraints before wider use

## Limited-use conditions

If used in a later bounded slice, the approved limited scope should be:

1. suggestion generation only
2. no installation into normal runtime flows yet
3. no hook enablement
4. no direct writes to `AGENTS.md`, `TOOLS.md`, `SOUL.md`, `MEMORY.md`, or
   policy-related files
5. no direct promotion to approved memory, procedures, or skill candidates
6. outputs treated as candidate material only
7. any use must remain subordinate to the documented procurement and review
   policy

## Install decision for this slice

`self-improving-agent` is **not installed** in this slice.

Reason:

- the vetting result supports only bounded limited use
- the current repo policy does not justify immediate installation for normal use
- additional constrained-evaluation design is still needed before any install

## Skill Vetter summary format

SKILL VETTING REPORT
═══════════════════════════════════════
Skill: self-improving-agent
Source: GitHub (`openclaw/skills`)
Author: `1215656`
Version: `1215656-self-improving-agent-3-0-6`
───────────────────────────────────────
METRICS:
• Stars: `3652`
• Forks: `1019`
• Last Updated: `2026-04-01T04:11:00Z`
• Files Reviewed: `13`
───────────────────────────────────────
RED FLAGS: No immediate critical red flags; architecture concerns around direct
learning-file writes, control-file promotion, optional hooks, and skill
extraction workflow

PERMISSIONS NEEDED:
• Files: `.learnings/*`, plus potential promotion targets such as `AGENTS.md`,
`TOOLS.md`, `SOUL.md`, `MEMORY.md`, and related files
• Network: none in reviewed runtime code; installation examples are network-backed
• Commands: optional `openclaw hooks enable`, shell hooks, and extraction helper
───────────────────────────────────────
RISK LEVEL: `🟡 MEDIUM`

VERDICT: `⚠️ APPROVE FOR LIMITED USE`

NOTES: useful as a candidate-learning accelerator, but not acceptable as a
canonical memory substrate or for normal-use installation under current policy
═══════════════════════════════════════
