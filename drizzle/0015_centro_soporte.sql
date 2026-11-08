CREATE TABLE "errores_sistema" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid,
	"usuario_id" uuid,
	"origen" text NOT NULL,
	"ruta" text DEFAULT '' NOT NULL,
	"mensaje" text NOT NULL,
	"digest" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_soporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"autor_id" uuid,
	"accion" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensajes_soporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"de_soporte" boolean DEFAULT false NOT NULL,
	"texto" text NOT NULL,
	"adjunto_nombre" text,
	"adjunto_tipo" text,
	"adjunto_datos" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitudes_soporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"folio" serial NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"categoria" text,
	"asunto" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"responsable_id" uuid,
	"contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"visto_usuario_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "es_prueba" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "errores_sistema" ADD CONSTRAINT "errores_sistema_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errores_sistema" ADD CONSTRAINT "errores_sistema_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_soporte" ADD CONSTRAINT "eventos_soporte_solicitud_id_solicitudes_soporte_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_soporte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_soporte" ADD CONSTRAINT "eventos_soporte_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes_soporte" ADD CONSTRAINT "mensajes_soporte_solicitud_id_solicitudes_soporte_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_soporte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes_soporte" ADD CONSTRAINT "mensajes_soporte_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_soporte" ADD CONSTRAINT "solicitudes_soporte_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_soporte" ADD CONSTRAINT "solicitudes_soporte_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_soporte" ADD CONSTRAINT "solicitudes_soporte_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "errores_sistema_fecha_idx" ON "errores_sistema" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "eventos_soporte_solicitud_idx" ON "eventos_soporte" USING btree ("solicitud_id");--> statement-breakpoint
CREATE INDEX "mensajes_soporte_solicitud_idx" ON "mensajes_soporte" USING btree ("solicitud_id","creado_en");--> statement-breakpoint
CREATE INDEX "solicitudes_soporte_estado_idx" ON "solicitudes_soporte" USING btree ("estado","actualizado_en");--> statement-breakpoint
CREATE INDEX "solicitudes_soporte_usuario_idx" ON "solicitudes_soporte" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE solicitudes_soporte ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mensajes_soporte ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE eventos_soporte ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE errores_sistema ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    FOREACH t IN ARRAY ARRAY['solicitudes_soporte', 'mensajes_soporte', 'eventos_soporte', 'errores_sistema'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'app_' || t) THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO crabs_app USING (true) WITH CHECK (true)', 'app_' || t, t);
      END IF;
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO crabs_app', t);
    END LOOP;
    GRANT USAGE, SELECT ON SEQUENCE solicitudes_soporte_folio_seq TO crabs_app;
  END IF;
END $$;
