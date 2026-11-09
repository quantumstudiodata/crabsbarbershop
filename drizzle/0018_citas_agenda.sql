ALTER TABLE barberias ADD COLUMN agenda_activa boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE barberias ADD COLUMN horario_agenda jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE citas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  barberia_id uuid NOT NULL REFERENCES barberias(id),
  servicio_id uuid REFERENCES servicios(id),
  barbero_id uuid NOT NULL REFERENCES usuarios(id),
  token_publico uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_nombre text NOT NULL,
  cliente_telefono text NOT NULL,
  cliente_email text,
  servicio_nombre text NOT NULL,
  duracion_min integer NOT NULL,
  precio integer NOT NULL,
  inicia_en timestamp with time zone NOT NULL,
  termina_en timestamp with time zone NOT NULL,
  estado text DEFAULT 'reservada' NOT NULL,
  estado_pago text DEFAULT 'sin_pagar' NOT NULL,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  creada_por uuid REFERENCES usuarios(id),
  creado_en timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX citas_token_publico_uq ON citas USING btree (token_publico);
--> statement-breakpoint
CREATE UNIQUE INDEX citas_stripe_session_uq ON citas USING btree (stripe_checkout_session_id);
--> statement-breakpoint
CREATE INDEX citas_barberia_inicio_idx ON citas USING btree (barberia_id, inicia_en);
--> statement-breakpoint
CREATE INDEX citas_barbero_inicio_idx ON citas USING btree (barbero_id, inicia_en);
--> statement-breakpoint
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crabs_app') THEN
    CREATE POLICY app_citas ON citas FOR ALL TO crabs_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON citas TO crabs_app;
  END IF;
END $$;
