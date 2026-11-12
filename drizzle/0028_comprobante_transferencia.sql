CREATE TABLE "comprobantes_cita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"datos" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "whatsapp" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "citas" ADD COLUMN "transferencia_comprobante_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comprobantes_cita" ADD CONSTRAINT "comprobantes_cita_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_cita" ADD CONSTRAINT "comprobantes_cita_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_cita_cita_uq" ON "comprobantes_cita" USING btree ("cita_id");