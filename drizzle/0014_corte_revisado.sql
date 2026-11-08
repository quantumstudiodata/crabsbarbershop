ALTER TABLE "turnos_caja" ADD COLUMN "revisado_por" uuid;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD COLUMN "revisado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;