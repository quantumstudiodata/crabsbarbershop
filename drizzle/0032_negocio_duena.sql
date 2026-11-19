CREATE TABLE "negocio_duena" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"turno_id" uuid,
	"monto" integer NOT NULL,
	"en_caja" integer DEFAULT 0 NOT NULL,
	"comprobante_nombre" text,
	"comprobante_tipo" text,
	"comprobante_datos" text,
	"usuario_id" uuid,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "negocio_duena" ADD CONSTRAINT "negocio_duena_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocio_duena" ADD CONSTRAINT "negocio_duena_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocio_duena" ADD CONSTRAINT "negocio_duena_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocio_duena" ADD CONSTRAINT "negocio_duena_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "negocio_duena_barberia_idx" ON "negocio_duena" USING btree ("barberia_id","tipo");--> statement-breakpoint
CREATE INDEX "negocio_duena_turno_idx" ON "negocio_duena" USING btree ("turno_id");