---
name: Publish governance safety
description: Observed limits of managed schema diffs when PostgreSQL routines protect review history and renewed grants.
---

Do not assume the managed development-to-production diff transports PostgreSQL
functions and triggers merely because it includes their tables, indexes and
constraints. Authorization must remain fail-closed until the expected immutable
audit and grant-renewal controls are present and enabled.

**Why:** A live diff included the new review structures but omitted their governance
functions and triggers. Copying tables alone would not preserve the full SQL safeguards.

**How to apply:** Inspect the current diff and expected SQL objects before publishing.
Use a supported publication path; do not bypass production read-only access or add
startup/build-time self-healing DDL. Confirm the physical safeguards before permitting
professional decisions. Recheck the live tool behavior rather than assuming this
limitation is permanent.

Prefer an explicit boolean comparison when preparing checks for the publishing diff.

**Why:** A shorthand boolean check was introspected as nested `CHECK (CHECK (...))`,
which is invalid PostgreSQL. The equivalent explicit comparison generated valid SQL.

**How to apply:** Syntax-test generated additive DDL in a disposable development
schema inside a rolled-back transaction. A “no data loss” result does not prove the
generated SQL is valid or that procedural safeguards were included.

Do not treat a successful development schema command as proof that the database
used by the publishing service has converged.

**Why:** A CLI returned success while the publishing service's development schema
still exposed the old boolean check. The cause of that discrepancy was not established.

**How to apply:** Verify physical constraint definitions through the supported
database service, then replay its exact generated diff in a disposable database.
Reconcile only reviewed development changes; never bypass production read-only
access or copy development data into production.

Verify canonical function behavior and trigger events, not just object names and
enabled flags. Keep release metadata checks and runtime authorization checks aligned
with the intentionally versioned SQL definitions.

**Why:** A trigger can remain enabled and bound to the expected function while that
function has been replaced with a no-op. Presence-only verification would accept it.

**How to apply:** Reject altered canonical bodies, wrong trigger events and disabled
controls. When intentionally changing governance SQL, update its verification contract
in lockstep and prove rejection/restoration using a disposable synthetic database.

Manual operator edits are documented at Database → production database → My Data
→ Edit → SQL runner. This UI mode does not grant the agent production write access.

**Why:** Official documentation distinguishes the owner's manual edit surface from
the agent's read-only production replica. Publish's table diff omitted routines.

**How to apply:** Explain the exact operator action using reviewed schema sources,
without a custom production runner or startup/build DDL. Verify physical controls
read-only after the operator's change; a successful UI execution is not proof.

Decision writes must recheck physical audit integrity inside their transactional
INSERT, not rely solely on an earlier authorization read.

**Why:** A previously successful authorization can become stale if a control is
disabled or replaced before the decision is persisted.

**How to apply:** Share the canonical integrity predicate between authorization and
the write boundary, and prove refusal with synthetic changes between those steps.
