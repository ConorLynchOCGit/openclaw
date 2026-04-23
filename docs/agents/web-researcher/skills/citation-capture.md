# citation-capture

## Purpose

Capture claim-linked evidence so research outputs remain auditable.

## Framework

For each important claim, record:

- claim
- source title
- author or publisher
- publication date
- canonical URL
- DOI if present
- supporting passage or exact evidence note
- confidence / verification note

## Output rule

Formatting style such as APA is a render layer, not the storage model.

The canonical internal structure is claim-to-source traceability.

## Guardrails

- do not emit unsupported claims
- do not lose the source-to-claim link during summarization
- prefer canonical URLs and DOI-normalized references when available
