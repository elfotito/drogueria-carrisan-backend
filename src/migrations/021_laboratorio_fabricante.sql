-- 021_laboratorio_fabricante.sql
-- Corrección de datos: el campo `laboratorio` del catálogo INHRR guarda el nombre
-- del FARMACÉUTICO REGENTE (la persona que firma el registro sanitario), no el
-- laboratorio/fabricante real. Se encontró en ~6,900 de 7,356 productos importados
-- (p.ej. 'CLARILU DEL CARMEN RODRIGUEZ PLATT' en ASPIRINA BAYER cuando el
-- fabricante real es BAYER S.A.).
--
-- El fabricante real está en la cadena `fabricante → representante → patrocinante`.
-- Regla (decisión del dueño 2026-09-08): asignar `laboratorio = fabricante →
-- representante → patrocinante`; si en TODA la cadena no hay empresa capturada
-- (quedan sólo nombres de persona), se DEJA el valor tal cual (es lo único
-- disponible en el registro INHRR).
--
-- Idempotente: solo actualiza filas cuyo valor cambia. Se aplica a AMBAS tablas
-- (`productos`, la tienda que ve el usuario, y `productos_catalogo`, la fuente).

-- ============ 1) productos_catalogo (fuente) ============
UPDATE public.productos_catalogo AS pc
SET laboratorio = nuevo.lab
FROM (
    SELECT id,
           COALESCE(NULLIF(fabricante, ''), NULLIF(representante, ''),
                    NULLIF(patrocinante, ''), laboratorio) AS lab
    FROM public.productos_catalogo
) nuevo
WHERE pc.id = nuevo.id
  AND pc.laboratorio IS DISTINCT FROM nuevo.lab;

-- ============ 2) productos (tienda / catálogo visible) ============
UPDATE public.productos AS p
SET laboratorio = nuevo.lab
FROM (
    SELECT p2.id,
           COALESCE(NULLIF(pc.fabricante, ''), NULLIF(pc.representante, ''),
                    NULLIF(pc.patrocinante, ''), p2.laboratorio) AS lab
    FROM public.productos p2
    LEFT JOIN public.productos_catalogo pc ON pc.ef = p2.fuente_inhrr_ef
    WHERE p2.fuente_inhrr_ef IS NOT NULL
) nuevo
WHERE p.id = nuevo.id
  AND p.laboratorio IS DISTINCT FROM nuevo.lab;

-- ============ Verificación (opcional) ============
-- SELECT nombre_comercial, laboratorio FROM public.productos
-- WHERE lower(laboratorio) ~ '( regente|farmaceut$| de la iglesia| restifo)'
-- LIMIT 20;
