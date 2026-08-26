-- Migración: Tabla de tarifas de delivery por ciudad
-- Ejecutar en el SQL Editor de Supabase Dashboard

-- 1. Crear tabla
CREATE TABLE tarifas_delivery (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ciudad    TEXT NOT NULL UNIQUE,
  costo     NUMERIC(10,2) NOT NULL DEFAULT 8.00,
  activo    BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS (básico, el backend usa service role que bypasea RLS)
ALTER TABLE tarifas_delivery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON tarifas_delivery FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Insertar ciudades iniciales con precio base $8
INSERT INTO tarifas_delivery (ciudad, costo) VALUES
  ('Valencia', 8.00),
  ('Naguanagua', 8.00),
  ('San Diego', 8.00),
  ('Guacara', 8.00),
  ('Los Guayos', 8.00);
