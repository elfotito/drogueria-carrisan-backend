-- ============================================================
-- Migración 007: Agregar columnas de expiración y creación
-- a la tabla codigos_invitacion
-- ============================================================
-- Ejecutar en Supabase SQL Editor si la tabla ya existe.
-- Si la tabla NO existe, ejecutar primero el bloque de creación.
-- ============================================================

-- Crear tabla si no existe (idempotente)
CREATE TABLE IF NOT EXISTS codigos_invitacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  usado BOOLEAN DEFAULT false,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  fecha_uso TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ DEFAULT now(),
  expira_en TIMESTAMPTZ NOT NULL
);

-- Agregar columnas si la tabla ya existía sin ellas
ALTER TABLE codigos_invitacion
  ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expira_en TIMESTAMPTZ NOT NULL;

-- Tabla de perfiles honoríficos (idempotente)
CREATE TABLE IF NOT EXISTS perfiles_honorifico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tratamiento TEXT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  codigo_invitacion_usado TEXT
);
