CREATE TABLE "peticiones_internas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"pagina" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"respuesta" text,
	"resuelta_por" uuid,
	"resuelta_en" timestamp with time zone,
	"visto_usuario_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "peticiones_internas" ADD CONSTRAINT "peticiones_internas_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peticiones_internas" ADD CONSTRAINT "peticiones_internas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peticiones_internas" ADD CONSTRAINT "peticiones_internas_resuelta_por_usuarios_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "peticiones_internas_barberia_idx" ON "peticiones_internas" USING btree ("barberia_id","estado");--> statement-breakpoint
CREATE INDEX "peticiones_internas_usuario_idx" ON "peticiones_internas" USING btree ("usuario_id");