-- 019_productos_precio_nullable.sql
-- El diseño "consultar precio" (catálogo INHRR → tienda) representa "sin
-- precio" como `precio_usd = NULL` (producto visible pero NO comprable hasta
-- que admin/staff fije precio > 0 → disponible=true). La tabla quedó con
-- NOT NULL por legacy; se relaja. ConstruirOrden además rechaza NULL/0.
ALTER TABLE public.productos
  ALTER COLUMN precio_usd DROP NOT NULL;