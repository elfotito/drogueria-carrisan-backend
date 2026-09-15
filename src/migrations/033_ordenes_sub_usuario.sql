-- 033_ordenes_sub_usuario.sql
--
-- La columna `ordenes.sub_usuario_id` (bigint NULL) YA existe en la BD con
-- FK a `sub_usuarios(id)` pero SIN acción ON DELETE (NO ACTION por defecto).
-- El backend nunca la utilizó: `createOrden`/`construirOrden` descartaban
-- `sub_usuario_id` del body y GET /orders no unía `sub_usuarios`.
--
-- Esta migración reconstruye la FK con ON DELETE SET NULL (mismo patrón que
-- `ordenes_creado_por_staff_id_fkey` y `ordenes_agencia_envio_id_fkey`) para
-- que eliminar un sub-usuario no bloquee el historial de sus órdenes.
--
-- Aplicación manual (2026-09-15, vía runner con SUPABASE_DB_*).
ALTER TABLE ordenes
  DROP CONSTRAINT IF EXISTS ordenes_sub_usuario_id_fkey;

ALTER TABLE ordenes
  ADD CONSTRAINT ordenes_sub_usuario_id_fkey
  FOREIGN KEY (sub_usuario_id) REFERENCES sub_usuarios(id) ON DELETE SET NULL;