-- 035_registro_invita.sql
--
-- Candado del registro por invitación (profesional + honorífico).
-- La página /registro/invita solo se habilita si el token de la URL coincide
-- con el vigente Y habilitado = true. El dueño controla el acceso desde el
-- panel admin (Gestión de códigos): apagar/activar y regenerar token (al
-- regenerar, el enlace anterior deja de funcionar al instante).
--
-- Aplicación manual (2026-09-17, vía runner con SUPABASE_DB_*).
CREATE TABLE IF NOT EXISTS public.registro_invita_config (
  id integer PRIMARY KEY CHECK (id = 1),
  habilitado boolean NOT NULL DEFAULT true,
  token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.registro_invita_config (id, habilitado, token)
VALUES (1, true, substr(replace(gen_random_uuid()::text, '-', ''), 1, 20))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.registro_invita_config ENABLE ROW LEVEL SECURITY;

-- Lectura pública: la API consulta esta única fila desde el backend. No hay
-- datos sensibles (es un candado de acceso, no credenciales de la empresa).
CREATE POLICY registro_invita_config_read ON public.registro_invita_config
  FOR SELECT USING (true);