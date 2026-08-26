-- Migración: Recrear notificacion_preferencias con integer usuario_id
-- Ejecutar en el SQL Editor de Supabase Dashboard

-- 1. Eliminar la tabla incorrecta (UUID referencing auth.users)
DROP TABLE IF EXISTS notificacion_preferencias CASCADE;

-- 2. Recrear con integer usuario_id referencia users(id)
CREATE TABLE notificacion_preferencias (
  usuario_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_activo   BOOLEAN NOT NULL DEFAULT true,
  push_ordenes  BOOLEAN NOT NULL DEFAULT true,
  push_pagos    BOOLEAN NOT NULL DEFAULT true,
  push_chat     BOOLEAN NOT NULL DEFAULT true,
  push_credito  BOOLEAN NOT NULL DEFAULT true,
  push_sistema  BOOLEAN NOT NULL DEFAULT true,
  push_ofertas  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS (básico, el backend usa service role que bypasea RLS)
ALTER TABLE notificacion_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON notificacion_preferencias FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Trigger para updated_at
DROP TRIGGER IF EXISTS on_notificacion_preferencias_update ON notificacion_preferencias;
CREATE TRIGGER on_notificacion_preferencias_update
  BEFORE UPDATE ON notificacion_preferencias
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_timestamp();

-- 5. Insertar preferencias para el usuario 2 (Viktor)
INSERT INTO notificacion_preferencias (usuario_id, push_activo, push_ordenes, push_pagos, push_chat, push_credito, push_sistema, push_ofertas)
VALUES (2, true, true, true, true, true, true, true)
ON CONFLICT (usuario_id) DO UPDATE SET
  push_activo = true,
  push_ordenes = true,
  push_pagos = true,
  push_chat = true,
  push_credito = true,
  push_sistema = true,
  push_ofertas = true;

-- 6. Agregar 'oferta' al check constraint de la tabla notificaciones
-- (el constraint actual no incluye 'oferta', causando error al enviar promociones)
DO $$
BEGIN
  -- Eliminar el constraint anterior
  ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
  -- Recrear con todos los tipos que usa la app
  ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check
    CHECK (tipo IN (
      'general', 'orden', 'orden_creada', 'orden_confirmada', 'orden_enviada',
      'orden_entregada', 'orden_cancelada', 'estado_cambiado', 'orden_actualizada',
      'pago_registrado', 'pago_recibido', 'pago_rechazado', 'pago_reportado', 'pago_verificado',
      'chat_mensaje', 'orden_por_vencer', 'orden_vencida', 'oferta',
      'reporte_cliente', 'info', 'sistema'
    ));
END $$;
