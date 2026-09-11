-- 026_facturacion.sql
-- Módulo staff Facturación: monto en Bs congelado + tasa usada al emitir
-- (patrón de reportes_pago) y soft-delete de documentos (anulada).
-- Ejecutar manualmente en Supabase SQL Editor.

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS monto_bs NUMERIC,
  ADD COLUMN IF NOT EXISTS tasa_usada NUMERIC,
  ADD COLUMN IF NOT EXISTS anulada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulada_motivo TEXT,
  ADD COLUMN IF NOT EXISTS anulada_por UUID REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anulada_el TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_staff UUID REFERENCES staff(id) ON DELETE SET NULL;