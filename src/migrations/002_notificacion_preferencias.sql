-- Tabla de preferencias de notificación por usuario.
-- Cada usuario tiene UNA fila con toggles por categoría de push.
-- Si la fila no existe, se asume todo activado (defaults en el controller).

CREATE TABLE IF NOT EXISTS notificacion_preferencias (
  usuario_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_activo   BOOLEAN NOT NULL DEFAULT true,
  push_ordenes  BOOLEAN NOT NULL DEFAULT true,
  push_pagos    BOOLEAN NOT NULL DEFAULT true,
  push_chat     BOOLEAN NOT NULL DEFAULT true,
  push_credito  BOOLEAN NOT NULL DEFAULT true,
  push_sistema  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: cada usuario solo ve/edita sus propias preferencias
ALTER TABLE notificacion_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus propias preferencias"
  ON notificacion_preferencias FOR ALL
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_notificacion_preferencias_update ON notificacion_preferencias;
CREATE TRIGGER on_notificacion_preferencias_update
  BEFORE UPDATE ON notificacion_preferencias
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_timestamp();
