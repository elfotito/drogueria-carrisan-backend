-- 032_perfiles_institucional_documentos.sql
-- Documentos opcionales para el trámite de línea de crédito en el registro
-- institucional. No son requeridos para abrir el código con la droguería;
-- se pueden entregar/enviar a los asesores más adelante. Se persisten por si
-- el cliente los carga durante el registro (visibles para staff/admin).
-- APLICAR a mano en Supabase SQL Editor.
ALTER TABLE perfiles_institucional
  ADD COLUMN IF NOT EXISTS cedula_farmaceutico_url text NULL,
  ADD COLUMN IF NOT EXISTS titulo_farmaceutico_url text NULL,
  ADD COLUMN IF NOT EXISTS autorizacion_director_url text NULL;