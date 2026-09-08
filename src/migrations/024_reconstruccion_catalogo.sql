-- 024_reconstruccion_catalogo.sql
-- Reconstrucción del catálogo (espec 2026-09-08): (1) columnas de presentación/SKU,
-- (2) DROP del UNIQUE de fuente_inhrr_ef (varias presentaciones comparten ef),
-- (3) TRUNCATE cerrado de todo el historial test, (4) re-creación de FKs con
-- ON DELETE SET NULL para conversaciones/notificaciones.
-- Ejecutar a mano en Supabase SQL Editor ANTES de correr reconstruir-catalogo.mjs.

-- 1) Columnas nuevas (idempotente)
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS presentacion text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS unidades_por_presentacion integer;

-- 2) DROP del UNIQUE de fuente_inhrr_ef (varias presentaciones comparten ef)
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_fuente_inhrr_ef_key;

-- Índice único por SKU (admite NULLs para futuros productos creados a mano)
CREATE UNIQUE INDEX IF NOT EXISTS productos_sku_key ON public.productos (sku)
  WHERE sku IS NOT NULL;

-- 3) Detach de chat/notificaciones (conservadas) ANTES de truncar ordenes.
--    Se pierde la relación con la orden (pruebas), los mensajes/notis se conservan.
ALTER TABLE public.conversaciones DROP CONSTRAINT IF EXISTS conversaciones_orden_id_fkey;
ALTER TABLE public.notificaciones  DROP CONSTRAINT IF EXISTS notificaciones_orden_id_fkey;

-- 4) TRUNCATE cerrado (cierre FK completo de lo que se borra, sin CASCADE salvaje).
TRUNCATE TABLE public.alertas_disponibilidad,
  public.cotizaciones,
  public.descuentos,
  public.factura_ordenes,
  public.facturas,
  public.favoritos,
  public.listas_items,
  public.listas,
  public.ordenes_historial,
  public.ordenes_items,
  public.ordenes,
  public.pago_facturas,
  public.pagos,
  public.presupuesto_items,
  public.presupuestos,
  public.producto_costos,
  public.producto_detalles,
  public.producto_moleculas,
  public.productos,
  public.reporte_pago_ordenes,
  public.reportes_pago,
  public.requerimiento_items,
  public.requerimientos,
  public.usuarios_descuentos,
  public.valoraciones;

-- 5) NULLear orden_id huérfano en las conservadas (apuntan a ordenes que ya
--    no existen tras el TRUNCATE) ANTES de re-crear las FKs, o el ADD CONSTRAINT
--    falla. conversaciones_orden_id_check exige que tipo='orden' tenga orden_id:
--    las conversaciones de tipo 'orden' pasan a 'general' (los mensajes se
--    conservan, se pierde solo el vínculo con la orden de prueba).
UPDATE public.conversaciones SET tipo = 'general', orden_id = NULL WHERE orden_id IS NOT NULL;
UPDATE public.notificaciones  SET orden_id = NULL WHERE orden_id IS NOT NULL;

-- 6) Re-crear FKs de chat/notificaciones hacia ordenes (ya vacío), ahora SET NULL
ALTER TABLE public.conversaciones ADD CONSTRAINT conversaciones_orden_id_fkey
  FOREIGN KEY (orden_id) REFERENCES public.ordenes(id) ON DELETE SET NULL;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_orden_id_fkey
  FOREIGN KEY (orden_id) REFERENCES public.ordenes(id) ON DELETE SET NULL;