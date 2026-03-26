# K2 Game v2

To launch debug window: from main game client type shift-t.

ngrok is built in but doesn't launch by default.

Second version of K2 game, built using core node app template.

Project code imported from initial dev build.

## Session Retention Policy

This project uses a sliding retention policy for Session records:

- Default retention window: 90 days (`SESSION_RETENTION_DAYS=90`)
- Archive retention window: 90 days from initial archiving (`ARCHIVE_RETENTION_DAYS=90`, capped at 90)
- Facilitator warning window: 14 days (`FACILITATOR_TTL_WARNING_DAYS=14`)
- No policy exceptions
- Archive-before-delete is enforced by the retention runner

### Exact `.env` Settings

Use these values in `.env` for production-safe archive-before-delete behavior:

```env
SESSION_RETENTION_DAYS=90
ARCHIVE_RETENTION_DAYS=90
FACILITATOR_TTL_WARNING_DAYS=14
RETENTION_BATCH_SIZE=200
RETENTION_JOB_INTERVAL_MIN=60
RETENTION_JOB_ENABLED=false
RETENTION_JOB_APPLY=false
SESSION_TTL_INDEX_ENABLED=false
```

Notes:

- `SESSION_RETENTION_DAYS`: Sliding retention window for Session expiry calculation. Use lower values only for test cycles.
- `ARCHIVE_RETENTION_DAYS`: Number of days archived records remain after initial archiving. Values above 90 are capped at 90.
- `FACILITATOR_TTL_WARNING_DAYS`: Number of days before expiry when facilitator UI marks a session as near deletion.
- `RETENTION_BATCH_SIZE`: Maximum expired sessions processed per retention run.
- `RETENTION_JOB_INTERVAL_MIN`: Scheduler frequency in minutes when background retention is enabled.
- `RETENTION_JOB_ENABLED`: Enables/disables background retention scheduler at app startup.
- `RETENTION_JOB_APPLY`: Scheduler mode toggle. `false` means dry-run only, `true` performs archive then delete.
- `SESSION_TTL_INDEX_ENABLED`: Mongo auto-TTL index toggle. Keep `false` for strict archive-before-delete so Mongo does not pre-delete records.

### Retention Commands

Run a single dry cycle (safe, no writes):

```bash
npm run retention:dry
```

Run a single apply cycle (archives, then deletes archived records):

```bash
npm run retention:apply
```

Backfill archive expiry for existing `sessionarchives` documents (dry-run first):

```bash
npm run archive:backfill:dry
npm run archive:backfill:apply
```

### Scheduler Controls

To run on a schedule:

1. Set `RETENTION_JOB_ENABLED=true`
2. Keep `RETENTION_JOB_APPLY=false` initially to observe dry-run behavior in logs
3. Switch to `RETENTION_JOB_APPLY=true` when ready for live archive/delete cycles

### Audit Trail

Each retention run writes a JSONL audit record to:

- `logs/reports/session-retention-runs.jsonl`

Superusers can review recent runs in the Admin dashboard under **Retention Runs**.