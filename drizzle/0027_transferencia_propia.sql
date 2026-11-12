ALTER TABLE "barberias" ADD COLUMN "transferencia_banco" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "transferencia_clabe" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "transferencia_titular" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "citas" ADD COLUMN "transferencia_monto" integer DEFAULT 0 NOT NULL;