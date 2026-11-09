CREATE TABLE "bloqueos_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"usuario_id" uuid,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"motivo" text DEFAULT '' NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"folio" text NOT NULL,
	"cliente_nombre" text NOT NULL,
	"cliente_telefono" text NOT NULL,
	"barbero_id" uuid NOT NULL,
	"indiferente" boolean DEFAULT false NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"duracion_min" integer NOT NULL,
	"servicios" jsonb NOT NULL,
	"total" integer NOT NULL,
	"pagado" integer DEFAULT 0 NOT NULL,
	"metodo_pago" text,
	"estado_pago" text DEFAULT 'sin_pago' NOT NULL,
	"estado" text DEFAULT 'en_espera' NOT NULL,
	"observaciones" text DEFAULT '' NOT NULL,
	"origen" text DEFAULT 'negocio' NOT NULL,
	"token" text NOT NULL,
	"expira_en" timestamp with time zone,
	"venta_id" uuid,
	"motivo_cancelacion" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificaciones_cita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"cita_id" uuid,
	"tipo" text NOT NULL,
	"para" text NOT NULL,
	"destino" text DEFAULT '' NOT NULL,
	"mensaje" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"programada_para" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotaciones_descanso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"persona1" uuid NOT NULL,
	"persona2" uuid NOT NULL,
	"dia1" integer NOT NULL,
	"dia2" integer NOT NULL,
	"semana_inicio" date NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_citas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "horario" jsonb DEFAULT '{"1":["10:00","20:00"],"2":["10:00","20:00"],"3":["10:00","20:00"],"4":["10:00","20:00"],"5":["10:00","20:00"],"6":["10:00","20:00"]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "dias_cerrados" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "citas_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "horario" jsonb;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "atiende_citas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_barbero_id_usuarios_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones_cita" ADD CONSTRAINT "notificaciones_cita_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones_cita" ADD CONSTRAINT "notificaciones_cita_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotaciones_descanso" ADD CONSTRAINT "rotaciones_descanso_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotaciones_descanso" ADD CONSTRAINT "rotaciones_descanso_persona1_usuarios_id_fk" FOREIGN KEY ("persona1") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotaciones_descanso" ADD CONSTRAINT "rotaciones_descanso_persona2_usuarios_id_fk" FOREIGN KEY ("persona2") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueos_agenda_idx" ON "bloqueos_agenda" USING btree ("barberia_id","inicio");--> statement-breakpoint
CREATE INDEX "citas_agenda_idx" ON "citas" USING btree ("barberia_id","inicio");--> statement-breakpoint
CREATE INDEX "citas_barbero_idx" ON "citas" USING btree ("barbero_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "citas_token_uq" ON "citas" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "citas_folio_uq" ON "citas" USING btree ("barberia_id","folio");--> statement-breakpoint
CREATE INDEX "notificaciones_cita_idx" ON "notificaciones_cita" USING btree ("barberia_id","estado","programada_para");--> statement-breakpoint
UPDATE barberias b SET slug = x.s FROM (
  SELECT id, CASE WHEN count(*) OVER (PARTITION BY base) > 1 THEN base || '-' || left(id::text, 4) ELSE base END AS s
  FROM (SELECT id, nullif(trim(both '-' from regexp_replace(translate(lower(nombre), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9]+', '-', 'g')), '') AS base FROM barberias) y
) x WHERE x.id = b.id AND b.slug IS NULL AND x.s IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS barberias_slug_uq ON barberias (slug) WHERE slug IS NOT NULL;
--> statement-breakpoint
ALTER TABLE rotaciones_descanso ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bloqueos_agenda ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notificaciones_cita ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    FOREACH t IN ARRAY ARRAY['rotaciones_descanso', 'bloqueos_agenda', 'citas', 'notificaciones_cita'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'app_' || t) THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO crabs_app USING (true) WITH CHECK (true)', 'app_' || t, t);
      END IF;
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO crabs_app', t);
    END LOOP;
  END IF;
END $$;
