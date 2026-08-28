-- Migración 006: Agregar columna reinicio_clave a la tabla users
-- Cuando un admin autoriza un reinicio de contraseña, se setea esta columna
-- en true. El usuario puede entonces cambiar su contraseña desde /recuperar.
-- Después de usarla, vuelve a false automáticamente.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reinicio_clave boolean DEFAULT false;
