# Decisions

## Decision 1: Fetch-first remains canonical

Reason:

- it is the narrowest safe retrieval path for most public pages
- it minimizes unnecessary browser escalation
- it preserves a disciplined evidence trail

## Decision 2: Exact-page reads require current retrieval evidence

Reason:

- page facts are freshness-sensitive
- memory and prior runs are not reliable substitutes for current retrieval
- visible-field requests need retrieval trace in the active session

## Decision 3: Source evaluation uses mixed frameworks

Reason:

- SIFT and lateral reading are better for live web credibility checks
- CRAAP-style questions are still useful for formal documents and institutional sources
- one rubric alone is too blunt for all source classes

## Decision 4: Citations are claim-linked, not bibliography-only

Reason:

- operators need to trace a conclusion back to support
- citations are more valuable when attached to claims than when dumped at the end
- this improves auditability and contradiction handling

## Decision 5: Third-party research skills are inspiration, not core dependency

Reason:

- first-party behavior should remain aligned to OpenClaw runtime rules
- third-party skills introduce provenance, dependency, and drift risk
- the Web Researcher should have a coherent native operating model

## Decision 6: Monitoring must be tiered

Reason:

- not every signal deserves interruption
- urgency, confidence, and relevance should shape delivery
- this prevents noise and preserves operator trust
