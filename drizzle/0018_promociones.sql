CREATE TABLE "promociones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"tipo" text NOT NULL,
	"valor" integer NOT NULL,
	"servicio_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categorias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"desde" date NOT NULL,
	"hasta" date,
	"dias" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"hora_desde" text,
	"hora_hasta" text,
	"aplicacion" text DEFAULT 'auto' NOT NULL,
	"codigo" text,
	"en_cobro" boolean DEFAULT true NOT NULL,
	"en_linea" boolean DEFAULT true NOT NULL,
	"limite_usos" integer,
	"usos" integer DEFAULT 0 NOT NULL,
	"pausada" boolean DEFAULT false NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_promociones" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conceptos" ADD COLUMN "promocion_id" uuid;--> statement-breakpoint
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promociones_barberia_idx" ON "promociones" USING btree ("barberia_id");--> statement-breakpoint
ALTER TABLE promociones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promociones' AND policyname = 'app_promociones') THEN
      CREATE POLICY app_promociones ON promociones FOR ALL TO crabs_app USING (true) WITH CHECK (true);
    END IF;
    GRANT SELECT, INSERT, UPDATE, DELETE ON promociones TO crabs_app;
  END IF;
END $$;
