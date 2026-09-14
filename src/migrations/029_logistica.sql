-- 029_logistica.sql
-- Módulo Logística unificado (Pedidos/Envíos/Incidencias/Agencias).
-- Aplicar a mano en Supabase SQL Editor (no hay runner).

-- 1) Órdenes: flags logísticos (sin inventario físico)
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS paquete_verificado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incidencia_motivo text NULL,
  ADD COLUMN IF NOT EXISTS incidencia_fecha timestamptz NULL;

-- 2) Agencias de envío nacional (el texto libre agencia_envio se conserva)
CREATE TABLE IF NOT EXISTS agencias_envio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  telefono text,
  ubicacion text,
  tarifa_sugerida numeric(10,2),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS agencia_envio_id uuid NULL REFERENCES agencias_envio(id) ON DELETE SET NULL;

-- 3) Direcciones: acciones puntuales del módulo Direcciones staff
ALTER TABLE direcciones_envio
  ADD COLUMN IF NOT EXISTS es_preferida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota_entrega text NULL;

-- 4) Tipos de notificación nuevos (incidencia de entrega)
ALTER TABLE notificaciones
  DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;

ALTER TABLE notificaciones
  ADD CONSTRAINT notificaciones_tipo_check CHECK (
    tipo IN (
      'general', 'orden', 'orden_creada', 'orden_confirmada', 'orden_enviada',
      'orden_entregada', 'orden_cancelada', 'orden_aprobada', 'estado_cambiado',
      'orden_actualizada', 'pago_registrado', 'pago_recibido', 'pago_rechazado',
      'pago_reportado', 'pago_verificado', 'chat_mensaje', 'orden_por_vencer',
      'orden_vencida', 'cotizacion_respondida', 'cotizacion_rechazada',
      'factura_emitida', 'producto_disponible', 'documento_listo',
      'documento_aprobado', 'documento_rechazado', 'requerimiento_respondido',
      'oferta', 'reporte_cliente', 'info', 'sistema',
      'recordatorio_cobro', 'credito_bloqueado', 'credito_desbloqueado',
      'orden_incidencia'
    )
  );
