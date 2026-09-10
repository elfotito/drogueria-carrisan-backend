-- 025_codigos_invitacion_fechas.sql
-- Agrega las columnas de fechas que el código ya usa pero que la tabla
-- real (creada directamente en Supabase) nunca tuvo:
--   fecha_creacion: cuándo se generó el código.
--   expira_en:      vencimiento (48h por defecto).
-- La tabla solo tenía `created_at`. Backfill para que los códigos
-- existentes tengan un vencimiento coherente (creación + 48h).

ALTER TABLE codigos_invitacion
  ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expira_en TIMESTAMPTZ;

UPDATE codigos_invitacion
  SET fecha_creacion = COALESCE(fecha_creacion, created_at),
      expira_en = COALESCE(expira_en, COALESCE(created_at, now()) + INTERVAL '48 hours')
  WHERE fecha_creacion IS NULL OR expira_en IS NULL;