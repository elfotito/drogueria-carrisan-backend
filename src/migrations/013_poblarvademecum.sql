-- Ejecutar con psql conectado a tu base de Supabase, desde la carpeta
-- donde están los dos CSV generados por poblar-vademecum.js
-- Ejemplo: psql "postgresql://...tu-connection-string..." -f poblar-vademecum.sql

-- =========================================================
-- 1) atc_clasificaciones
-- =========================================================
CREATE TEMP TABLE atc_staging (
  codigo text,
  nombre text,
  nivel int,
  es_sistema boolean
);

\copy atc_staging FROM 'atc_clasificaciones_import.csv' WITH CSV HEADER;

INSERT INTO atc_clasificaciones (codigo, nombre, nivel, es_sistema)
SELECT s.codigo, s.nombre, s.nivel, s.es_sistema
FROM atc_staging s
WHERE NOT EXISTS (
  SELECT 1 FROM atc_clasificaciones a WHERE a.codigo = s.codigo
);

-- Resolver padre_id nivel por nivel, usando el propio código ATC
-- (A -> A01 -> A01A -> A01AA -> A01AA01)
UPDATE atc_clasificaciones child SET padre_id = parent.id
FROM atc_clasificaciones parent
WHERE child.nivel = 2 AND parent.nivel = 1
  AND parent.codigo = LEFT(child.codigo, 1)
  AND child.padre_id IS NULL;

UPDATE atc_clasificaciones child SET padre_id = parent.id
FROM atc_clasificaciones parent
WHERE child.nivel = 3 AND parent.nivel = 2
  AND parent.codigo = LEFT(child.codigo, 3)
  AND child.padre_id IS NULL;

UPDATE atc_clasificaciones child SET padre_id = parent.id
FROM atc_clasificaciones parent
WHERE child.nivel = 4 AND parent.nivel = 3
  AND parent.codigo = LEFT(child.codigo, 4)
  AND child.padre_id IS NULL;

UPDATE atc_clasificaciones child SET padre_id = parent.id
FROM atc_clasificaciones parent
WHERE child.nivel = 5 AND parent.nivel = 4
  AND parent.codigo = LEFT(child.codigo, 5)
  AND child.padre_id IS NULL;

-- =========================================================
-- 2) moleculas_referencias
-- =========================================================
CREATE TEMP TABLE moleculas_staging (
  nombre text,
  nombre_generico_en text,
  sinonimos text,
  descripcion text,
  atc_codigo text
);

\copy moleculas_staging FROM 'moleculas_referencias_import.csv' WITH CSV HEADER;

INSERT INTO moleculas_referencias (atc_id, nombre, nombre_generico_en, sinonimos, descripcion)
SELECT
  a.id,
  s.nombre,
  NULLIF(s.nombre_generico_en, ''),
  NULLIF(s.sinonimos, '')::text[],
  NULLIF(s.descripcion, '')
FROM moleculas_staging s
LEFT JOIN atc_clasificaciones a ON a.codigo = s.atc_codigo
WHERE NOT EXISTS (
  SELECT 1 FROM moleculas_referencias m WHERE m.nombre = s.nombre
);

-- Revisar cuántas moléculas quedaron sin atc_id (por si el ATC no se
-- pudo resolver desde CIMA, o el código no coincide con ninguno importado)
SELECT count(*) AS moleculas_sin_atc
FROM moleculas_referencias
WHERE atc_id IS NULL;
