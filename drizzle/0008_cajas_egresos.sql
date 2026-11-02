CREATE TABLE "comprobantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"gasto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"datos" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conceptos_frecuentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"concepto" text NOT NULL,
	"categoria" text NOT NULL,
	"monto" integer DEFAULT 0 NOT NULL,
	"metodo" text DEFAULT 'efectivo' NOT NULL,
	"periodicidad" text DEFAULT 'mensual' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "turnos_un_abierto_uq";--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "apertura_manual" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "modelo_caja" text DEFAULT 'compartida' NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_comprobantes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_periodicidad" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "periodicidad" text DEFAULT 'unica' NOT NULL;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD COLUMN "responsable_id" uuid;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "es_soporte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_gasto_id_gastos_id_fk" FOREIGN KEY ("gasto_id") REFERENCES "public"."gastos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conceptos_frecuentes" ADD CONSTRAINT "conceptos_frecuentes_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "turnos_un_abierto_uq" ON "turnos_caja" USING btree ("barberia_id",coalesce("responsable_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE estado = 'abierto';--> statement-breakpoint
ALTER TABLE "gastos" DROP CONSTRAINT IF EXISTS "gastos_metodo_ck";--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_metodo_ck" CHECK ("metodo" in ('efectivo', 'transferencia', 'tarjeta'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comprobantes_gasto_idx" ON "comprobantes" ("gasto_id");--> statement-breakpoint
UPDATE "usuarios" SET "permisos_extra" = (
  SELECT coalesce(array_agg(DISTINCT x), '{}') FROM unnest(
    array_cat(array_remove(array_remove(array_remove(array_remove("permisos_extra", 'ajustes.usuarios'), 'ajustes.negocio'), 'historial.ver'), 'equipo.ver'),
      (CASE WHEN 'ajustes.usuarios' = ANY("permisos_extra") THEN ARRAY['usuarios.ver','usuarios.editar'] ELSE '{}'::text[] END)
      || (CASE WHEN 'ajustes.negocio' = ANY("permisos_extra") THEN ARRAY['servicios.ver','servicios.editar','ajustes.funciones'] ELSE '{}'::text[] END)
      || (CASE WHEN 'historial.ver' = ANY("permisos_extra") THEN ARRAY['ventas.ver_todas'] ELSE '{}'::text[] END)
    )) AS x
) WHERE "permisos_extra" && ARRAY['ajustes.usuarios','ajustes.negocio','historial.ver','equipo.ver'];
