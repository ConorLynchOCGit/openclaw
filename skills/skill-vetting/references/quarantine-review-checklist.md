# Quarantine Review Checklist

Every review must report:

- skill slug and version
- where it came from
- whether search was done with `openclaw` or `clawhub`
- quarantine path used for acquisition
- commands or binaries required
- filesystem read/write surfaces
- network or external-service surfaces
- secret requirements
- useful ideas worth borrowing
- final outcome:
  - `install`
  - `inspire`
  - `reject`
- exact rationale

Review reminders:

- inspect `SKILL.md` first
- inspect only the scripts or references that materially affect behavior
- call out arbitrary shell, broad file access, hidden network egress, and
  operator-deceptive behavior explicitly
