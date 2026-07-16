# Agency Data

Bundled OpenClaw plugin for read-only agency marketing analytics. Its canonical authority is append-only JSONL at `<resolveStateDir()>/agency-data/canonical.jsonl`. No database, DuckDB, Parquet, scheduler, service, execution runner, GBrain writer, or Business Ops store is introduced.

## Canonical records

The schema version is `agency-data/v1`. Every record has a tenant, company/person subject boundary, channel, source provider/auth mode, source reference, event time, and recording time. The canonical object types are:

- `source_observation`, `account_snapshot`, `content_item`, `metric_definition`, `metric_observation`
- `campaign_variant_association`, `topic_format_audience_assignment`, `experiment`
- `recommendation`, `operator_decision`, `approved_learning`, `correction_tombstone`

`metric_observation` additionally requires account/content scope where applicable, metric family and definition, numerator, denominator, unit, completeness, stabilization, privacy, source reference, method version, observation time, and explicit `organic`, `promoted`, or `combined` distribution. Raw content-shaped fields are rejected; only hashes and structured metadata are retained.

X observations may identify a bounded `1h`, `24h`, `72h`, `7d`, `28d`, or
custom observation window. Content and campaign associations carry optional
`utm_id`, `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` fields
for later cross-channel linkage. Topic/format/audience assignments explicitly
distinguish pre-publication classification from retrospective inference.

Records are never rewritten. A `correction_tombstone` identifies a target record and either points to a separately appended, tenant-local replacement (`action: "correction"`) or removes the target from read views (`action: "tombstone"`). A correction does not hide its target until the replacement exists in the bounded canonical view.

## Tools

Exactly three read-only model tools are registered:

- `marketing_data_catalog`
- `marketing_metrics`
- `marketing_experiments`

They accept runtime-validated, tenant-scoped parameters only. Responses are capped at 200 records and 48 KiB of serialized model output; JSONL scans are capped at 100,000 physical rows. `marketing_metrics` requires one metric definition, reports totals, aggregate rate, median and p10/p25/p75/p90 rate percentiles, completeness, and sample-size/denominator warnings. Zero-denominator observations are excluded from all rate aggregates. Distribution queries match one explicit distribution, so organic, promoted, and combined data remain separate.

## Trusted ingestion and benchmark

`api.ts` exports `createTrustedAgencyDataIngestion({ stateDir })` for source adapters and tests. This is an internal callable module, not a registered model tool. Generic ingestion rejects control records so corrections and tombstones use their explicit methods. Appends serialize through a process-wide per-path queue, use one bounded `O_APPEND` write, and fsync each line without leaving a crash-stranded lock file.

The same internal API supports an all-or-nothing bounded batch append after
every record has passed schema validation. Operators can import explicitly
approved owned-X metric exports with:

```bash
openclaw agency-data import-x-csv <file> \
  --tenant <tenant> --subject-type <company|person> \
  --subject-id <subject> --account <account> --approved
```

The importer accepts only its documented normalized columns, rejects raw text,
caps file/row/record sizes, and is idempotent by deterministic record ID. It is
an operator CLI, not a model-visible write tool.

Run the synthetic plain-JSONL baseline with:

```bash
node --import tsx extensions/agency-data/scripts/benchmark-jsonl.ts
```

It writes and removes a temporary 100,000-observation JSONL file and reports elapsed time and RSS delta. Future projections must remain rebuildable from the canonical JSONL; DuckDB and Parquet are intentionally absent.
