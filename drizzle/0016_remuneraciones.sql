CREATE TABLE "remuneraciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"modalidad" text NOT NULL,
	"monto" integer DEFAULT 0 NOT NULL,
	"periodo" text DEFAULT 'mes' NOT NULL,
	"porcentaje" integer DEFAULT 0 NOT NULL,
	"horas_semana" integer DEFAULT 0 NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "remuneraciones" ADD CONSTRAINT "remuneraciones_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remuneraciones" ADD CONSTRAINT "remuneraciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "remuneraciones_usuario_idx" ON "remuneraciones" USING btree ("usuario_id","vigente_hasta");--> statement-breakpoint
ALTER TABLE remuneraciones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'remuneraciones' AND policyname = 'app_remuneraciones') THEN
      CREATE POLICY app_remuneraciones ON remuneraciones FOR ALL TO crabs_app USING (true) WITH CHECK (true);
    END IF;
    GRANT SELECT, INSERT, UPDATE, DELETE ON remuneraciones TO crabs_app;
  END IF;
END $$;
