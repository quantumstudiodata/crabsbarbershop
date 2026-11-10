CREATE TABLE "resenas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"barbero_id" uuid NOT NULL,
	"calificacion" integer NOT NULL,
	"comentario" text DEFAULT '' NOT NULL,
	"cliente" text DEFAULT '' NOT NULL,
	"respuesta" text,
	"respondida_por" uuid,
	"respondida_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD COLUMN "estado" text DEFAULT 'revision' NOT NULL;--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD COLUMN "autorizado_por" uuid;--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD COLUMN "autorizado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD COLUMN "nota" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Los faltantes asignados antes de este cambio ya se descontaban: quedan como autorizados para no alterar pagos pasados.
UPDATE "faltantes_caja" SET "estado" = 'autorizado', "autorizado_por" = "asignado_por", "autorizado_en" = "creado_en" WHERE "autorizado_en" IS NULL;--> statement-breakpoint
ALTER TABLE "reglas_comision" ADD COLUMN "frecuencia_pago" text;--> statement-breakpoint
ALTER TABLE "reglas_comision" ADD COLUMN "dia_corte" integer;--> statement-breakpoint
ALTER TABLE "reglas_comision" ADD COLUMN "dia_pago" integer;--> statement-breakpoint
ALTER TABLE "reglas_comision" ADD COLUMN "forma_pago" text DEFAULT 'efectivo' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "token_encuesta" text;--> statement-breakpoint
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_barbero_id_usuarios_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_respondida_por_usuarios_id_fk" FOREIGN KEY ("respondida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resenas_venta_uq" ON "resenas" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "resenas_barberia_idx" ON "resenas" USING btree ("barberia_id","creado_en");--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD CONSTRAINT "faltantes_caja_autorizado_por_usuarios_id_fk" FOREIGN KEY ("autorizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_token_encuesta_uq" ON "ventas" USING btree ("token_encuesta");--> statement-breakpoint
ALTER TABLE resenas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resenas' AND policyname = 'app_resenas') THEN
      CREATE POLICY app_resenas ON resenas FOR ALL TO crabs_app USING (true) WITH CHECK (true);
    END IF;
    GRANT SELECT, INSERT, UPDATE, DELETE ON resenas TO crabs_app;
  END IF;
END $$;
