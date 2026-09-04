-- 010_ordenes_items_anulado.sql
-- Añade a ordenes_items el flag de item agotado/anulado (auditoría) y una
-- nota opcional. La fila se conserva: el total de la orden se recalcula
-- excluyendo items anulados.
ALTER TABLE ordenes_items
  ADD COLUMN IF NOT EXISTS anulado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota_anulacion TEXT;