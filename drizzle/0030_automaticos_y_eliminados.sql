DROP INDEX "categorias_servicio_uq";--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "acepta_reembolsos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias_servicio" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conceptos_frecuentes" ADD COLUMN "automatico" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conceptos_frecuentes" ADD COLUMN "dia" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "conceptos_frecuentes" ADD COLUMN "ultimo" date;--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_servicio_uq" ON "categorias_servicio" USING btree ("barberia_id","nombre") WHERE "categorias_servicio"."eliminado_en" is null;