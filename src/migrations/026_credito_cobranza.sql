-- 026_credito_cobranza.sql
-- Fase 3: Crédito y Cobranza (/staff/credito)
--
-- 1) Tabla cobranza_notas (notas de seguimiento de cobranza por cliente).
-- 2) Columna users.credito_bloqueado + users.credito_bloqueado_motivo
--    (bloqueo manual y auto-freeze del módulo).
-- 3) Amplía notificaciones_tipo_check con los 3 tipos que emite el módulo
--    (recordatorio_cobro, credito_bloqueado, credito_desbloqueado) — sin
--    esto, crearNotificacion inserta con error silencioso.
--
-- Ejecutar a mano en Supabase SQL Editor (no hay runner).

-- 1. Notas de cobranza
CREATE TABLE IF NOT EXISTS cobranza_notas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('llamada', 'promesa_pago', 'pago_parcial', 'reclamo', 'otro')),
  nota text NOT NULL,
  fecha_seguimiento date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobranza_notas_usuario ON cobranza_notas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cobranza_notas_seguimiento ON cobranza_notas(fecha_seguimiento) WHERE fecha_seguimiento IS NOT NULL;

ALTER TABLE cobranza_notas ENABLE ROW LEVEL SECURITY;

-- Staff gestiona las notas; no es dato sensible a nivel de fila (el staff
-- tiene acceso amplio vía API). Política abierta para el SDK.
DROP POLICY IF EXISTS "staff_manage_cobranza_notas" ON cobranza_notas;
CREATE POLICY "staff_manage_cobranza_notas" ON cobranza_notas
  FOR ALL USING (true);

-- 2. Bloqueo de crédito en users
ALTER TABLE users ADD COLUMN IF NOT EXISTS credito_bloqueado boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credito_bloqueado_motivo text;

-- 3. Ampliar tipos de notificación permitidos
ALTER TABLE notificaciones
  DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;

ALTER TABLE notificaciones
  ADD CONSTRAINT notificaciones_tipo_check CHECK (
    tipo IN (
      'general',
      'orden',
      'orden_creada',
      'orden_confirmada',
      'orden_enviada',
      'orden_entregada',
      'orden_cancelada',
      'orden_aprobada',
      'estado_cambiado',
      'orden_actualizada',
      'pago_registrado',
      'pago_recibido',
      'pago_rechazado',
      'pago_reportado',
      'pago_verificado',
      'chat_mensaje',
      'orden_por_vencer',
      'orden_vencida',
      'recordatorio_cobro',
      'credito_bloqueado',
      'credito_desbloqueado',
      'cotizacion_respondida',
      'cotizacion_rechazada',
      'factura_emitida',
      'producto_disponible',
      'documento_listo',
      'documento_aprobado',
      'documento_rechazado',
      'requerimiento_respondido',
      'oferta',
      'reporte_cliente',
      'info',
      'sistema'
    )
  );