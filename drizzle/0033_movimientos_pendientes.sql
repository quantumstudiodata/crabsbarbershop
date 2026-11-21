CREATE TABLE "movimientos_pendientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"monto" integer NOT NULL,
	"concepto" text NOT NULL,
	"categoria" text,
	"responsable_id" uuid,
	"usuario_id" uuid NOT NULL,
	"aplicado_turno_id" uuid,
	"aplicado_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimientos_pendientes" ADD CONSTRAINT "movimientos_pendientes_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_pendientes" ADD CONSTRAINT "movimientos_pendientes_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_pendientes" ADD CONSTRAINT "movimientos_pendientes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_pendientes" ADD CONSTRAINT "movimientos_pendientes_aplicado_turno_id_turnos_caja_id_fk" FOREIGN KEY ("aplicado_turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_pendientes" ADD CONSTRAINT "movimientos_pendientes_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_pendientes_barberia_idx" ON "movimientos_pendientes" USING btree ("barberia_id","aplicado_turno_id");