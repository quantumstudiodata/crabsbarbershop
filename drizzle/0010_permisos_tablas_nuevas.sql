-- Las tablas creadas después de 0002 tienen RLS activo pero no tenían permiso para la app.
ALTER TABLE categorias_gasto ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE historico_mensual ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE comprobantes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE conceptos_frecuentes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    FOREACH t IN ARRAY ARRAY['categorias_gasto', 'historico_mensual', 'comprobantes', 'conceptos_frecuentes'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'app_' || t) THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO crabs_app USING (true) WITH CHECK (true)', 'app_' || t, t);
      END IF;
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO crabs_app', t);
    END LOOP;
  END IF;
END $$;
