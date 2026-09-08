-- 017_productos_laboratorio.sql
-- Agrega la columna `laboratorio` que el código ya esperaba en `productos`
-- (filtros por laboratorio en admin/staff, GET /products/metadata, descuentos
-- por alcance 'laboratorio', tarjeta del catálogo `marcas?.nombre || laboratorio`).
-- La llena el script scripts/importar-tienda.mjs a partir de productos_catalogo.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS laboratorio text;

CREATE INDEX IF NOT EXISTS idx_productos_laboratorio ON public.productos (laboratorio);