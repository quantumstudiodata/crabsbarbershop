CREATE TABLE "faltantes_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"monto" integer NOT NULL,
	"regla" text NOT NULL,
	"fecha" date NOT NULL,
	"asignado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD COLUMN "faltante_regla" text;--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD CONSTRAINT "faltantes_caja_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD CONSTRAINT "faltantes_caja_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD CONSTRAINT "faltantes_caja_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faltantes_caja" ADD CONSTRAINT "faltantes_caja_asignado_por_usuarios_id_fk" FOREIGN KEY ("asignado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faltantes_caja_usuario_idx" ON "faltantes_caja" USING btree ("usuario_id","fecha");--> statement-breakpoint
CREATE INDEX "faltantes_caja_turno_idx" ON "faltantes_caja" USING btree ("turno_id");--> statement-breakpoint
ALTER TABLE faltantes_caja ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'faltantes_caja' AND policyname = 'app_faltantes_caja') THEN
      CREATE POLICY app_faltantes_caja ON faltantes_caja FOR ALL TO crabs_app USING (true) WITH CHECK (true);
    END IF;
    GRANT SELECT, INSERT, UPDATE, DELETE ON faltantes_caja TO crabs_app;
  END IF;
END $$;
