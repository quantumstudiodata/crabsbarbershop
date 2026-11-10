CREATE TABLE "pagos_linea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"token" text NOT NULL,
	"intento" text,
	"cita_id" uuid,
	"venta_id" uuid,
	"monto" integer NOT NULL,
	"propina" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"plan" jsonb,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tarjeta" text DEFAULT '' NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"pagado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "stripe_cuenta" text;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "stripe_estado" text DEFAULT 'sin' NOT NULL;--> statement-breakpoint
ALTER TABLE "pagos_linea" ADD CONSTRAINT "pagos_linea_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_linea" ADD CONSTRAINT "pagos_linea_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_linea" ADD CONSTRAINT "pagos_linea_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_linea" ADD CONSTRAINT "pagos_linea_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_linea_token_uq" ON "pagos_linea" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_linea_intento_uq" ON "pagos_linea" USING btree ("intento");--> statement-breakpoint
CREATE INDEX "pagos_linea_barberia_idx" ON "pagos_linea" USING btree ("barberia_id","creado_en");