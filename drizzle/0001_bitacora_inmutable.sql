-- El historial no se puede editar ni borrar: solo se agregan líneas.
CREATE OR REPLACE FUNCTION historial_solo_agregar() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial no se puede modificar ni borrar';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER historial_sin_cambios BEFORE UPDATE OR DELETE ON historial
  FOR EACH ROW EXECUTE FUNCTION historial_solo_agregar();
--> statement-breakpoint
-- Las ventas y su detalle tampoco se borran: se cancelan con motivo.
CREATE OR REPLACE FUNCTION ventas_sin_borrar() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las ventas no se borran: se cancelan con motivo';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ventas_no_delete BEFORE DELETE ON ventas FOR EACH ROW EXECUTE FUNCTION ventas_sin_borrar();
--> statement-breakpoint
CREATE TRIGGER conceptos_no_delete BEFORE DELETE ON conceptos FOR EACH ROW EXECUTE FUNCTION ventas_sin_borrar();
--> statement-breakpoint
CREATE TRIGGER pagos_no_delete BEFORE DELETE ON pagos FOR EACH ROW EXECUTE FUNCTION ventas_sin_borrar();
--> statement-breakpoint
CREATE TRIGGER propinas_no_delete BEFORE DELETE ON propinas FOR EACH ROW EXECUTE FUNCTION ventas_sin_borrar();
--> statement-breakpoint
-- En Supabase, las tablas del esquema public quedan expuestas por su API pública.
-- Activar RLS sin políticas cierra ese acceso; la app se conecta como dueña de las tablas y no se ve afectada.
ALTER TABLE barberias ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sesiones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE turnos_caja ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ajustes_cierre ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE conceptos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE propinas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reglas_comision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pagos_comision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE historial ENABLE ROW LEVEL SECURITY;
