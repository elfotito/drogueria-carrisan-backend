-- 011_codigos_invitacion_tipo_staff.sql
-- Agrega soporte para códigos de invitación de staff.
-- tipo: 'honorifico' (default para códigos existentes) | 'staff'
-- rol_staff: solo se llena cuando tipo='staff', indica el rol asignado al registrarse.

ALTER TABLE codigos_invitacion
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'honorifico';

ALTER TABLE codigos_invitacion
  ADD COLUMN IF NOT EXISTS rol_staff VARCHAR(30);