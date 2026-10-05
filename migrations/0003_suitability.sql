CREATE TABLE "suitability_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"perfil" varchar(12) NOT NULL,
	"pontuacao_media" numeric(4, 2) NOT NULL,
	"respostas" jsonb NOT NULL,
	"data_avaliacao" timestamp with time zone DEFAULT now() NOT NULL,
	"data_proxima_reavaliacao" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "suitability_profiles_user_idx" ON "suitability_profiles" USING btree ("user_id","data_avaliacao");
--> statement-breakpoint
CREATE TABLE "suitability_terms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ticker" varchar(12) NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"divergencia" text NOT NULL,
	"assinado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "suitability_terms_user_ticker_idx" ON "suitability_terms" USING btree ("user_id","ticker");