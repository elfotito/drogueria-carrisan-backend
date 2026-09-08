-- 022_producto_costo.sql
-- Agrega el costo de compra del producto (entrada del proveedor COBECA),
-- separado del precio de venta al cliente (productos.precio_usd).
-- costo_usd = costo de adquisición en USD; precio_usd se deriva = costo / MARGEN.
-- Idempotente.
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS costo_usd numeric NULL;