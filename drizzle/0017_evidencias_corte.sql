CREATE TABLE "evidencias_corte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"etiqueta" text DEFAULT '' NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"datos" text NOT NULL,
	"subido_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_evidencia_corte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evidencias_corte" ADD CONSTRAINT "evidencias_corte_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias_corte" ADD CONSTRAINT "evidencias_corte_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias_corte" ADD CONSTRAINT "evidencias_corte_subido_por_usuarios_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidencias_corte_turno_idx" ON "evidencias_corte" USING btree ("turno_id");--> statement-breakpoint
ALTER TABLE evidencias_corte ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evidencias_corte' AND policyname = 'app_evidencias_corte') THEN
      CREATE POLICY app_evidencias_corte ON evidencias_corte FOR ALL TO crabs_app USING (true) WITH CHECK (true);
    END IF;
    GRANT SELECT, INSERT, UPDATE, DELETE ON evidencias_corte TO crabs_app;
  END IF;
END $$;
