-- 020_eliminar_check_forma.sql
-- `productos.forma` tenía un CHECK creado directo en Supabase (whitelist legacy
-- tipo 'Ampolla') que NO coincide con las formas del catálogo INHRR que llegan
-- por importar-tienda.mjs: INYECTABLE, POLVO LIOFILIZADO, JERINGA PRELLENADA,
-- POLVO PARA RECONSTITUCION. La validación queda en la capa de aplicación
-- (igual que linea/laboratorio/molecula, que no tienen CHECK).
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_forma_check;

-- (Por si el dueño quiere ver qué decía antes de correr esto)
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'productos_forma_check';