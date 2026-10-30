CREATE TABLE "categorias_gasto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historico_mensual" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"egresos" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"por_columna" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_propinas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_descuentos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_metas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_dividir_pago" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "usa_renta_silla" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "plan" text DEFAULT 'inicial' NOT NULL;--> statement-breakpoint
ALTER TABLE "barberias" ADD COLUMN "estado_cuenta" text DEFAULT 'activa' NOT NULL;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "descripcion" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "metodo" text DEFAULT 'efectivo' NOT NULL;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "cancelado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "cancelado_por" uuid;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "motivo_cancelacion" text;--> statement-breakpoint
ALTER TABLE "categorias_gasto" ADD CONSTRAINT "categorias_gasto_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_mensual" ADD CONSTRAINT "historico_mensual_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_gasto_uq" ON "categorias_gasto" USING btree ("barberia_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "historico_mensual_uq" ON "historico_mensual" USING btree ("barberia_id","mes");--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_metodo_ck" CHECK ("metodo" in ('efectivo', 'transferencia'));--> statement-breakpoint
INSERT INTO "categorias_gasto" ("barberia_id", "nombre", "orden")
SELECT b.id, c.nombre, c.orden FROM "barberias" b
CROSS JOIN (VALUES ('Renta', 1), ('Agua', 2), ('Luz', 3), ('Teléfono', 4), ('Lavandería', 5), ('Otros', 99)) AS c(nombre, orden)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "categorias_gasto" ("barberia_id", "nombre", "orden")
SELECT DISTINCT g.barberia_id, g.categoria, 50 FROM "gastos" g
ON CONFLICT DO NOTHING;
