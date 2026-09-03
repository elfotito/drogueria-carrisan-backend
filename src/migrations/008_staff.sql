-- Migración: Personal interno (staff) para login y panel administrativo
-- separado del login de clientes (users). Ejecutar en el SQL Editor de
-- Supabase Dashboard.
--
-- Lo que cubre:
--   1. Tabla `staff` (login interno, roles, revocación de sesión).
--   2. Columna `ordenes.creado_por_staff_id` (trazabilidad de pedidos
--      creados por un vendedor desde /staff/ordenes).

-- 1. Tabla staff: mismo patrón de PK INTEGER que `users`.
CREATE TABLE staff (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'vendedor'
                CHECK (rol IN ('vendedor', 'despachador', 'administrador', 'admin')),
  activo        BOOLEAN DEFAULT true,
  token_version INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS: el backend usa service role (bypasea RLS); básico por consistencia.
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON staff FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Trazabilidad: pedido creado por un vendedor de staff.
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS creado_por_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;

-- 3. Seed opcional: primer administrador. Reemplaza <EMAIL> y <HASH>.
--    Para generar el hash del password usa:
--      node -e "console.log(require('bcrypt').hashSync('TU_PASSWORD', 10))"
-- INSERT INTO staff (email, password_hash, nombre, rol) VALUES
--   ('<EMAIL>', '<HASH>', 'Administrador', 'admin');
