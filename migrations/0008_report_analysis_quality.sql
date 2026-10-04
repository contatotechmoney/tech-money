-- Add metadata only. Do not backfill, overwrite or approve historical reports.
ALTER TABLE investment_reports ADD COLUMN IF NOT EXISTS analysis_quality jsonb;