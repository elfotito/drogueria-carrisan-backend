-- 032_ampliaciones_credito.sql
-- Tabla de historial de ampliaciones/modificaciones de línea de crédito.
-- Referenciada por credito.controller.js (PATCH linea) y
-- estadocuenta.controller.js (solicitarAmpliacion).

CREATE TABLE IF NOT EXISTS ampliaciones_credito (
  id serial PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linea_anterior numeric NOT NULL DEFAULT 0,
  linea_nueva numeric NOT NULL DEFAULT 0,
  motivo text,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ampliaciones_credito_usuario
  ON ampliaciones_credito (usuario_id);
