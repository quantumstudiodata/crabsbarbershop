CREATE TABLE "solicitudes_clave" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"atendida" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "categoria" text DEFAULT 'Cortes' NOT NULL;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD COLUMN "verificacion" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "avatar" text DEFAULT 'tijera' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "meta_semanal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "clave_temporal" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "clave_temporal_expira" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "solicitudes_clave" ADD CONSTRAINT "solicitudes_clave_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_clave" ADD CONSTRAINT "solicitudes_clave_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solicitudes_barberia_idx" ON "solicitudes_clave" USING btree ("barberia_id","atendida");--> statement-breakpoint
ALTER TABLE "solicitudes_clave" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    CREATE POLICY app_solicitudes_clave ON solicitudes_clave FOR ALL TO crabs_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON solicitudes_clave TO crabs_app;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "servicios" SET "categoria" = 'Barba y paquetes' WHERE "nombre" ILIKE '%barba%';
--> statement-breakpoint
UPDATE "servicios" SET "categoria" = 'Niños y extras' WHERE "nombre" ILIKE '%infantil%' OR "nombre" ILIKE '%ceja%';
