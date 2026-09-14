# Migrate

**Covers:** migration and recovery. **Escalates to:** Shift.

- Separate expand, backfill, switch, and contract when compatibility requires it.
- Make backfills bounded, restartable, observable, and idempotent.
- Account for mixed application versions during rollout.
- Validate representative volume and lock behavior.
- Define recovery for data effects, not only code rollback.

Required evidence: rehearsal, validation queries, and recovery procedure.
Will not authorize destructive production operations.
