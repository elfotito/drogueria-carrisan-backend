-- scripts/cargar-catalogo.sql
-- Carga los CSV generados por scripts/importar-catalogo.mjs en las tablas
-- del catálogo (requiere haber ejecutado 014_productos_catalogo.sql).
--
-- Uso (desde la raíz del backend, igual que la 013):
--   psql "postgresql://...tu-connection-string..." -f scripts/cargar-catalogo.sql
--
-- Los CSV viven en data/:
--   catalogo_productos_import.csv      (7,416 productos)
--   catalogo_moleculas_import.csv      (bridge ef -> molecula CIMA)
-- Idempotente: reaplica sin duplicar; los productos que desaparecen de un
-- re-import se marcan activo=false (re-importación periódica ~6 meses).

-- =========================================================
-- 1) producto_catalogo (upsert por ef)
-- =========================================================
CREATE TEMP TABLE catalogo_productos_staging (
  ef text, sort_id text, sku text, nombre text, forma text, categoria text,
  principio_activo text, representante text, rif_representante text,
  patrocinante text, fabricante text, fecha_aprobado text, fecha_vigencia text,
  fecha_cancelado text
);

\copy catalogo_productos_staging FROM 'data/catalogo_productos_import.csv' WITH CSV HEADER;

INSERT INTO productos_catalogo (
  sku, ef, sort_id, nombre, forma, categoria, principio_activo, laboratorio,
  representante, rif_representante, patrocinante, fabricante,
  fecha_aprobado, fecha_vigencia, fecha_cancelado, activo
)
SELECT
  s.sku,
  s.ef,
  NULLIF(s.sort_id, '')::bigint,
  s.nombre,
  NULLIF(s.forma, ''),
  s.categoria,
  NULLIF(s.principio_activo, ''),
  NULLIF(COALESCE(NULLIF(s.patrocinante, ''), NULLIF(s.representante, '')), ''),
  NULLIF(s.representante, ''),
  NULLIF(s.rif_representante, ''),
  NULLIF(s.patrocinante, ''),
  NULLIF(s.fabricante, ''),
  NULLIF(s.fecha_aprobado, '')::date,
  NULLIF(s.fecha_vigencia, '')::date,
  NULLIF(s.fecha_cancelado, '')::date,
  true
FROM catalogo_productos_staging s
ON CONFLICT (ef) DO UPDATE SET
  sku = EXCLUDED.sku,
  sort_id = EXCLUDED.sort_id,
  nombre = EXCLUDED.nombre,
  forma = EXCLUDED.forma,
  categoria = EXCLUDED.categoria,
  principio_activo = EXCLUDED.principio_activo,
  laboratorio = EXCLUDED.laboratorio,
  representante = EXCLUDED.representante,
  rif_representante = EXCLUDED.rif_representante,
  patrocinante = EXCLUDED.patrocinante,
  fabricante = EXCLUDED.fabricante,
  fecha_aprobado = EXCLUDED.fecha_aprobado,
  fecha_vigencia = EXCLUDED.fecha_vigencia,
  fecha_cancelado = EXCLUDED.fecha_cancelado,
  activo = true,
  updated_at = now();

-- Lo que ya no viene en el CSV pierde vigencia (se conserva por historial)
UPDATE productos_catalogo SET activo = false, updated_at = now()
WHERE activo AND ef NOT IN (SELECT ef FROM catalogo_productos_staging);

-- =========================================================
-- 2) catalogo_moleculas (bridge, se regenera en cada carga)
-- =========================================================
CREATE TEMP TABLE catalogo_moleculas_staging (
  ef text, mol_inhrr text, mol_cima text, score text
);

\copy catalogo_moleculas_staging FROM 'data/catalogo_moleculas_import.csv' WITH CSV HEADER;

TRUNCATE catalogo_moleculas;

INSERT INTO catalogo_moleculas (producto_catalogo_id, molecula_id, score)
SELECT DISTINCT p.id, m.id, NULLIF(s.score, '')::numeric
FROM catalogo_moleculas_staging s
JOIN productos_catalogo p ON p.ef = s.ef
JOIN moleculas_referencias m ON m.nombre = s.mol_cima;

-- =========================================================
-- 3) Control
-- =========================================================
SELECT count(*) AS productos_catalogo FROM productos_catalogo WHERE activo;
SELECT count(*) AS moleculas_enlazadas FROM catalogo_moleculas;
SELECT count(*) AS productos_sin_molecula
FROM productos_catalogo p
WHERE p.activo AND NOT EXISTS (SELECT 1 FROM catalogo_moleculas cm WHERE cm.producto_catalogo_id = p.id);