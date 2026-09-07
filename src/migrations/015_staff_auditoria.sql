-- 015_staff_auditoria.sql
-- Auditoría de acciones de staff en los módulos migrados de /admin a /staff
-- (Cotizaciones, Requerimientos, Documentos, Promociones).
-- Cada tabla registra staff_id (quién actuó) cuando la acción viene por /staff/*;
-- las acciones del panel /admin (sesión cliente) dejan staff_id NULL.
-- Ejecutar a mano en Supabase SQL Editor.

-- Cotizaciones: quién respondió / rechazó
ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

-- Solicitudes de documentos: quién aprobó / rechazó
ALTER TABLE solicitudes_documentos
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

-- Requerimientos: quién respondió
ALTER TABLE requerimientos
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

-- Plantillas de promoción: quién creó / actualizó
ALTER TABLE promociones_plantillas
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

-- Auditoría de borrado de plantillas: la fila se elimina, este registro
-- preserva qué plantilla se borró y quién lo hizo.
CREATE TABLE IF NOT EXISTS promociones_plantillas_eliminadas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plantilla_id BIGINT,
  titulo TEXT,
  mensaje TEXT,
  descuento_pct NUMERIC,
  codigo_cupon TEXT,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  eliminada_at TIMESTAMPTZ DEFAULT now()
);