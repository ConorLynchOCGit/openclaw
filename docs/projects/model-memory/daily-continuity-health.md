---
summary: "Health-check and proof path for same-day daily continuity artifacts."
title: "Daily Continuity Health"
---

# Daily Continuity Health

## Canonical artifact

- `/root/.openclaw/workspace/memory/YYYY-MM-DD.md`

## Failure class this closes

The daily note generation path had already been repaired once, but the
canonical same-day note still went missing for `2026-04-18`. The system lacked
an immediate proof command to catch the gap the same day.

## Canonical health-check command

```bash
node scripts/check-daily-memory-continuity.mjs --json
```

## What the check proves

- current workspace root used
- expected date
- exact expected daily note path
- whether the file is present
- whether the daily header is present
- how many canonical session entries were appended

## Ownership rule

- the file itself is an operator-visible continuity artifact
- the retained `session-memory` hook may append canonical session entries
- appends must preserve existing human content
- missing same-day coverage is a health failure, not a reason to invent fake continuity
