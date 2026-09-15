-- 031_mensajes_chat_staff.sql
-- Centro de Comunicaciones del módulo Comercial staff.
-- `mensajes_chat.remitente_id` es FK bigint -> users(id); el personal interno
-- (tabla `staff`, id uuid) NO tiene fila en `users`, así que no puede escribirse ahí
-- (misma clase de violación de FK que resolvió 030 para pagos).
-- Se deja remitente_id nullable y se agrega staff_id (uuid FK staff) para que los
-- mensajes respondidos por staff identifiquen quién respondió.
-- APLICAR a mano en Supabase SQL Editor.
ALTER TABLE mensajes_chat ALTER COLUMN remitente_id DROP NOT NULL;

ALTER TABLE mensajes_chat
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id) ON DELETE SET NULL;