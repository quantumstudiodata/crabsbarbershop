CREATE TYPE "public"."estado_idea" AS ENUM('aprobada', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."estado_turno" AS ENUM('abierto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."estado_venta" AS ENUM('pagada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('admin', 'duena', 'encargada', 'barbera', 'contador');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('entrada', 'retiro', 'devolucion');--> statement-breakpoint
CREATE TYPE "public"."tipo_pago_comision" AS ENUM('pago', 'renta');--> statement-breakpoint
CREATE TYPE "public"."tipo_regla" AS ENUM('porcentaje', 'fijo', 'renta', 'sueldo', 'mixto');--> statement-breakpoint
CREATE TABLE "ajustes_cierre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"monto" integer NOT NULL,
	"motivo" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barberias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"zona_horaria" text DEFAULT 'America/Monterrey' NOT NULL,
	"folio_prefijo" text DEFAULT 'CRB' NOT NULL,
	"siguiente_folio" integer DEFAULT 1 NOT NULL,
	"limite_descuento_pct" integer DEFAULT 15 NOT NULL,
	"limite_diferencia_caja" integer DEFAULT 5000 NOT NULL,
	"meta_diaria" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conceptos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"servicio_id" uuid,
	"nombre_servicio" text NOT NULL,
	"barbero_id" uuid NOT NULL,
	"precio_lista" integer NOT NULL,
	"descuento" integer DEFAULT 0 NOT NULL,
	"motivo_descuento" text,
	"autorizado_por" uuid,
	"precio_cobrado" integer NOT NULL,
	"regla_comision" jsonb,
	"comision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"categoria" text NOT NULL,
	"concepto" text NOT NULL,
	"monto" integer NOT NULL,
	"fecha" date NOT NULL,
	"turno_id" uuid,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historial" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"barberia_id" uuid NOT NULL,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"tipo" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"titulo" text NOT NULL,
	"estado" "estado_idea" NOT NULL,
	"nota" text DEFAULT '' NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metodos_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"es_efectivo" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"monto" integer NOT NULL,
	"concepto" text NOT NULL,
	"venta_id" uuid,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"metodo_pago_id" uuid,
	"nombre_metodo" text NOT NULL,
	"es_efectivo" boolean NOT NULL,
	"monto" integer NOT NULL,
	"referencia" text
);
--> statement-breakpoint
CREATE TABLE "pagos_comision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"barbero_id" uuid NOT NULL,
	"tipo" "tipo_pago_comision" NOT NULL,
	"monto" integer NOT NULL,
	"semana" date NOT NULL,
	"nota" text DEFAULT '' NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "propinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"barbero_id" uuid NOT NULL,
	"monto" integer NOT NULL,
	"es_efectivo" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reglas_comision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"barbero_id" uuid NOT NULL,
	"servicio_id" uuid,
	"tipo" "tipo_regla" NOT NULL,
	"porcentaje" integer DEFAULT 0 NOT NULL,
	"monto_fijo" integer DEFAULT 0 NOT NULL,
	"monto_semanal" integer DEFAULT 0 NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_hasta" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"duracion_min" integer DEFAULT 30 NOT NULL,
	"precio" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnos_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"fecha_operativa" date NOT NULL,
	"estado" "estado_turno" DEFAULT 'abierto' NOT NULL,
	"fondo_inicial" integer NOT NULL,
	"abierto_por" uuid NOT NULL,
	"abierto_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrado_por" uuid,
	"cerrado_en" timestamp with time zone,
	"efectivo_esperado" integer,
	"efectivo_contado" integer,
	"diferencia" integer,
	"notas_cierre" text
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"usuario" text NOT NULL,
	"hash" text NOT NULL,
	"rol" "rol" NOT NULL,
	"permisos_extra" text[] DEFAULT '{}'::text[] NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"debe_cambiar" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barberia_id" uuid NOT NULL,
	"folio" text NOT NULL,
	"turno_id" uuid NOT NULL,
	"registrada_por" uuid NOT NULL,
	"estado" "estado_venta" DEFAULT 'pagada' NOT NULL,
	"total" integer NOT NULL,
	"descuento_total" integer DEFAULT 0 NOT NULL,
	"observaciones" text DEFAULT '' NOT NULL,
	"motivo_cancelacion" text,
	"cancelada_por" uuid,
	"cancelada_en" timestamp with time zone,
	"venta_origen_id" uuid,
	"clave_unica" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ajustes_cierre" ADD CONSTRAINT "ajustes_cierre_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_cierre" ADD CONSTRAINT "ajustes_cierre_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_cierre" ADD CONSTRAINT "ajustes_cierre_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conceptos" ADD CONSTRAINT "conceptos_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conceptos" ADD CONSTRAINT "conceptos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conceptos" ADD CONSTRAINT "conceptos_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conceptos" ADD CONSTRAINT "conceptos_barbero_id_usuarios_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conceptos" ADD CONSTRAINT "conceptos_autorizado_por_usuarios_id_fk" FOREIGN KEY ("autorizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial" ADD CONSTRAINT "historial_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial" ADD CONSTRAINT "historial_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metodos_pago" ADD CONSTRAINT "metodos_pago_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_metodo_pago_id_metodos_pago_id_fk" FOREIGN KEY ("metodo_pago_id") REFERENCES "public"."metodos_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_comision" ADD CONSTRAINT "pagos_comision_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_comision" ADD CONSTRAINT "pagos_comision_barbero_id_usuarios_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_comision" ADD CONSTRAINT "pagos_comision_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propinas" ADD CONSTRAINT "propinas_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propinas" ADD CONSTRAINT "propinas_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propinas" ADD CONSTRAINT "propinas_barbero_id_usuarios_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_comision" ADD CONSTRAINT "reglas_comision_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_comision" ADD CONSTRAINT "reglas_comision_barbero_id_usuarios_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_comision" ADD CONSTRAINT "reglas_comision_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_abierto_por_usuarios_id_fk" FOREIGN KEY ("abierto_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_barberia_id_barberias_id_fk" FOREIGN KEY ("barberia_id") REFERENCES "public"."barberias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_registrada_por_usuarios_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cancelada_por_usuarios_id_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conceptos_venta_idx" ON "conceptos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "conceptos_barbero_idx" ON "conceptos" USING btree ("barbero_id");--> statement-breakpoint
CREATE INDEX "historial_barberia_idx" ON "historial" USING btree ("barberia_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "ideas_clave_uq" ON "ideas" USING btree ("barberia_id","clave");--> statement-breakpoint
CREATE INDEX "pagos_venta_idx" ON "pagos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "turnos_barberia_fecha_idx" ON "turnos_caja" USING btree ("barberia_id","fecha_operativa");--> statement-breakpoint
CREATE UNIQUE INDEX "turnos_un_abierto_uq" ON "turnos_caja" USING btree ("barberia_id") WHERE estado = 'abierto';--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_usuario_uq" ON "usuarios" USING btree ("usuario");--> statement-breakpoint
CREATE INDEX "usuarios_barberia_idx" ON "usuarios" USING btree ("barberia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_folio_uq" ON "ventas" USING btree ("barberia_id","folio");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_clave_uq" ON "ventas" USING btree ("barberia_id","clave_unica");--> statement-breakpoint
CREATE INDEX "ventas_turno_idx" ON "ventas" USING btree ("turno_id");