-- 018_productos_fuente_unique.sql
-- PostgREST NO puede usar un índice único PARCIAL como target de ON CONFLICT
-- ("no unique or exclusion constraint matching the ON CONFLICT specification").
-- Se reemplaza por una constraint UNIQUE real sobre fuente_inhrr_ef:
--   - permite múltiples NULL (los productos no-INHRR siguen con fuente NULL)
--   - habilita upsert(lote, { onConflict: 'fuente_inhrr_ef' }) en importar-tienda.mjs
DROP INDEX IF EXISTS productos_fuente_inhrr_ef_idx;

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_fuente_inhrr_ef_key;

ALTER TABLE public.productos
  ADD CONSTRAINT productos_fuente_inhrr_ef_key UNIQUE (fuente_inhrr_ef);