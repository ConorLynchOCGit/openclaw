# Webhook Gateway Host Script Patch Durability

Purpose: patch-only durability for live webhook-gateway host script overrides.

Live source path: `/root/services/webhook-gateway`

Preserved artifacts:

- `n8n_sync_check.sh.patch`
- `db_probe.sh.patch`

Dependency note:

- `projects/ops/send_chief_telegram.sh` in the workspace repo is the shared Telegram helper these host scripts depend on.

Why patch-only durability is used instead of canonical copies:

- These scripts execute from the live host stack under `/root/services/webhook-gateway`, not from the workspace repo.
- Patch-only capture preserves the live delta without creating a second canonical source of truth for host-executed scripts.
- The workspace repo already documents the behavior and preserves the shared helper; the host script body itself should remain owned by the live host stack unless a later migration intentionally changes that.

Reapply guidance for future host-script updates:

1. Treat `/root/services/webhook-gateway/*.sh` as the live execution source.
2. Diff the current live script against the last known durable baseline before changing behavior.
3. Update the patch files in this directory when host-script alert or delivery logic changes.
4. Keep `projects/ops/send_chief_telegram.sh` aligned if the host scripts continue to depend on that helper.
5. Verify the host cron logs after any reapply or behavior change.
