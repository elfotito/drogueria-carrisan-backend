-- =============================================================
-- 012_facturas_tipo_notas.sql
-- Soporte de notas de crédito/débito en facturas.
-- Ejecutar manualmente en Supabase SQL Editor (no idempotente en
-- la primera versión; usa IF NOT EXISTS para re-ejecución segura).
--
-- Agrega a `facturas`:
--   - tipo: 'factura' (default) | 'nota_credito' | 'nota_debito'
--   - factura_referencia_id: factura a la que la nota afecta (NULL si es factura)
--   - motivo: razón de la nota (devolución, ajuste, descuento, etc.)
-- =============================================================

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'factura';

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS factura_referencia_id INTEGER REFERENCES facturas(id);

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS motivo TEXT;