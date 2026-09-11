-- 027_tesoreria_movimientos_caja.sql
-- Módulo Tesorería: tabla de movimientos de caja (egresos manuales)
-- Los ingresos se derivan de la tabla 'pagos' (read-only); esta tabla solo almacena egresos.

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  tipo        text NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  categoria   text NOT NULL,
  concepto    text NOT NULL,
  monto       numeric NOT NULL CHECK (monto > 0),
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now()
);

-- Restricción: categorías válidas para egresos
ALTER TABLE movimientos_caja
  ADD CONSTRAINT movimientos_caja_categoria_egreso_check
  CHECK (
    tipo != 'egreso'
    OR categoria IN ('Proveedores', 'Nómina', 'Servicios', 'Mantenimiento', 'Impuestos', 'Otro')
  );

-- Restricción: categorías válidas para ingresos
ALTER TABLE movimientos_caja
  ADD CONSTRAINT movimientos_caja_categoria_ingreso_check
  CHECK (
    tipo != 'ingreso'
    OR categoria IN ('Pagos', 'Facturas', 'Otro')
  );

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_fecha ON movimientos_caja(fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tipo   ON movimientos_caja(tipo);

-- RLS: solo staff autenticado puede leer/escribir (las rutas backend ya protegen, pero RLS como capa extra)
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read movimientos_caja"
  ON movimientos_caja FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "staff can insert movimientos_caja"
  ON movimientos_caja FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');