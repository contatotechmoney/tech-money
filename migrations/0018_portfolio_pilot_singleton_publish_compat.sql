-- Development migration only. Production receives the additive official publish diff.
-- Preserve the existing restriction atomically; do not change bindings or copy rows.
ALTER TABLE "public"."portfolio_pilot_owner_bindings"
  DROP CONSTRAINT "portfolio_pilot_owner_singleton_check",
  ADD CONSTRAINT "portfolio_pilot_owner_singleton_check" CHECK ("singleton" = true);
