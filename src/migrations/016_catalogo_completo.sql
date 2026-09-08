-- 016_catalogo_completo.sql
-- Catálogo INHRR → tienda:
--   productos.fuente_inhrr_ef   llave de importación (ef INHRR), único parcial
--   producto_moleculas          bridge producto ↔ molécula (no-op en la BD viva)
--   productos_por_atc()         RPC: productos cuya molécula cae en un grupo ATC (por prefijo)
--
-- Ejecutar a mano en Supabase SQL Editor (las migraciones no tienen runner).

-- 1) Llave de importación idempotente
ALTER TABLE productos ADD COLUMN IF NOT EXISTS fuente_inhrr_ef text;

CREATE UNIQUE INDEX IF NOT EXISTS productos_fuente_inhrr_ef_idx
  ON productos (fuente_inhrr_ef)
  WHERE fuente_inhrr_ef IS NOT NULL;

-- 2) Bridge producto ↔ molécula (la BD viva ya lo tiene: no-op)
CREATE TABLE IF NOT EXISTS producto_moleculas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id        bigint NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  molecula_id        bigint NOT NULL REFERENCES moleculas_referencias(id),
  concentracion      text,
  unidad_concentracion text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, molecula_id)
);

-- 3) Productos por grupo ATC. El prefijo cubre el grupo y TODOS sus
--    descendientes (N02BE01 matchea con p_codigo='N02'). p_nivel queda en
--    la firma por diseño (proyectado a futuro) pero la lógica es por prefijo.
CREATE OR REPLACE FUNCTION public.productos_por_atc(p_nivel integer, p_codigo text)
RETURNS TABLE(producto_id bigint)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT pm.producto_id
  FROM producto_moleculas pm
  JOIN moleculas_referencias mr ON mr.id = pm.molecula_id
  JOIN atc_clasificaciones a    ON a.id = mr.atc_id
  WHERE a.codigo LIKE (p_codigo || '%')
$$;

GRANT EXECUTE ON FUNCTION public.productos_por_atc(integer, text) TO anon, authenticated;