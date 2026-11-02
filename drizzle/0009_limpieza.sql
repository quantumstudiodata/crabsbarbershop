-- La limpieza de datos de prueba (solo cuenta de soporte) puede borrar ventas e historial dentro de su transacción.
-- Fuera de ella, todo sigue igual: el historial no se edita ni se borra y las ventas se cancelan, no se borran.
CREATE OR REPLACE FUNCTION historial_solo_agregar() RETURNS trigger AS $$
BEGIN
  IF current_setting('crabs.limpieza', true) = 'si' AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'El historial no se puede modificar ni borrar';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ventas_sin_borrar() RETURNS trigger AS $$
BEGIN
  IF current_setting('crabs.limpieza', true) = 'si' THEN RETURN OLD; END IF;
  -- Al modificar una venta se reemplazan sus pagos; la venta y sus servicios siguen sin poder borrarse.
  IF current_setting('crabs.edicion', true) = 'pagos' AND TG_TABLE_NAME = 'pagos' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Las ventas no se borran: se cancelan con motivo';
END;
$$ LANGUAGE plpgsql;
