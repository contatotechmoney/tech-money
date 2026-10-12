ALTER TABLE "suitability_terms" ADD COLUMN "risco" numeric(4, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "suitability_terms" ADD COLUMN "perfil_exigido" varchar(12) DEFAULT 'CONSERVADOR' NOT NULL;
--> statement-breakpoint
ALTER TABLE "suitability_terms" ALTER COLUMN "risco" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "suitability_terms" ALTER COLUMN "perfil_exigido" DROP DEFAULT;
--> statement-breakpoint
CREATE INDEX "suitability_terms_context_idx" ON "suitability_terms" USING btree ("user_id","ticker","tipo","risco","perfil_exigido","assinado_em");