-- 030_pagos_reporte_staff.sql
-- Auditoría de acciones staff sobre pagos y reportes de pago.
-- `pagos.created_by` y `reportes_pago.verificado_por` son FK a `users(id)` (integer).
-- El personal interno (tabla `staff`, id uuid) NO puede escribirse ahí (violación de FK).
-- Se agregan columnas propias por staff siguiendo el patrón de 026_facturacion
-- (facturas.created_by_staff) y 026_credito_cobranza (cobranza_notas.staff_id).
-- APLICAR a mano en Supabase SQL Editor.
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS created_by_staff uuid REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE reportes_pago
  ADD COLUMN IF NOT EXISTS verificado_por_staff uuid REFERENCES staff(id) ON DELETE SET NULL;