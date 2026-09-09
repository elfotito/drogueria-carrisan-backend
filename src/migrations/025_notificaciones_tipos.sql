-- 025_notificaciones_tipos.sql
-- Amplía notificaciones_tipo_check con los tipos que la app ya emite
-- (crearNotificacion + inserts directos de promociones) pero que el CHECK
-- rechazaba: las notificaciones se insertaban con error silencioso
-- (crearNotificacion en notificaciones.controller.js traga el error).
--
-- Ejecutar a mano en Supabase SQL Editor (no hay runner).

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