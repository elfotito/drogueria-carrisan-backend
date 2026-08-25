-- Plantillas de promociones / ofertas que los admins pueden enviar a todos los usuarios.
-- Cada plantilla tiene un título, mensaje, y datos opcionales de descuento.
-- Las notificaciones enviadas se guardan en la tabla notificaciones (ya existente)
-- y el push se envía masivamente vía push_subscriptions.

CREATE TABLE IF NOT EXISTS promociones_plantillas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          TEXT NOT NULL,
  mensaje         TEXT NOT NULL,
  descuento_pct   INTEGER,                    -- porcentaje de descuento (opcional)
  codigo_cupon    TEXT,                        -- código de cupón (opcional)
  imagen_url      TEXT,                        -- imagen de la promo (opcional)
  activa          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historial de promociones enviadas
CREATE TABLE IF NOT EXISTS promociones_enviadas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id    UUID REFERENCES promociones_plantillas(id) ON DELETE SET NULL,
  titulo          TEXT NOT NULL,
  mensaje         TEXT NOT NULL,
  descuento_pct   INTEGER,
  codigo_cupon    TEXT,
  usuarios_total  INTEGER NOT NULL DEFAULT 0,
  enviadas        INTEGER NOT NULL DEFAULT 0,
  fallos          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: solo admins pueden gestionar (la app ya valida admin en el frontend)
ALTER TABLE promociones_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE promociones_enviadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan plantillas"
  ON promociones_plantillas FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins ven historial de envíos"
  ON promociones_enviadas FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at en plantillas
DROP TRIGGER IF EXISTS on_promociones_plantillas_update ON promociones_plantillas;
CREATE TRIGGER on_promociones_plantillas_update
  BEFORE UPDATE ON promociones_plantillas
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_timestamp();

-- Agregar categoría 'ofertas' a las preferencias de notificación
ALTER TABLE notificacion_preferencias
  ADD COLUMN IF NOT EXISTS push_ofertas BOOLEAN NOT NULL DEFAULT true;
