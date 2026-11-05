CREATE TABLE "categorias_servicio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"plantilla" "rol" DEFAULT 'duena' NOT NULL,
	"permisos" text[] DEFAULT '{}'::text[] NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "metodos_egreso" text[] DEFAULT '{efectivo,transferencia,tarjeta}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "permisos_quitados" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "puesto_id" uuid;--> statement-breakpoint
ALTER TABLE "categorias_servicio" ADD CONSTRAINT "categorias_servicio_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puestos" ADD CONSTRAINT "puestos_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_servicio_uq" ON "categorias_servicio" USING btree ("barberia_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "puestos_uq" ON "puestos" USING btree ("barberia_id","nombre");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Las categorías que ya usan los servicios, en el orden en que aparecen hoy.
INSERT INTO "categorias_servicio" ("barberia_id", "nombre", "orden")
SELECT barberia_id, categoria, (row_number() OVER (PARTITION BY barberia_id ORDER BY min(orden), categoria))::int * 10
FROM "servicios" GROUP BY barberia_id, categoria
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "puestos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categorias_servicio" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    FOREACH t IN ARRAY ARRAY['puestos', 'categorias_servicio'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'app_' || t) THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO crabs_app USING (true) WITH CHECK (true)', 'app_' || t, t);
      END IF;
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO crabs_app', t);
    END LOOP;
  END IF;
END $$;
