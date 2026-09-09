import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await c.connect();

const q = async (label, sql) => {
  try {
    const { rows } = await c.query(sql);
    console.log(`\n### ${label}`);
    console.table(rows);
  } catch (err) {
    console.log(`\n### ${label}`);
    console.log('ERROR:', err.message);
  }
};

// 1. Existe la tabla moleculas_ficha_tecnica?
await q('moleculas_ficha_tecnica - existe / columnas', `
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'moleculas_ficha_tecnica'
  ORDER BY ordinal_position
`);

await q('moleculas_ficha_tecnica - conteo y relleno', `
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE indicaciones_terapeuticas IS NOT NULL) AS con_indicaciones,
    count(*) FILTER (WHERE posologia IS NOT NULL) AS con_posologia,
    count(*) FILTER (WHERE contraindicaciones IS NOT NULL) AS con_contraindicaciones,
    count(*) FILTER (WHERE efectos_adversos IS NOT NULL) AS con_efectos_adversos
  FROM moleculas_ficha_tecnica
`);

// 2. moleculas_referencias estado
await q('moleculas_referencias - estado', `
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE descripcion IS NOT NULL AND descripcion <> '') AS con_descripcion,
    count(*) FILTER (WHERE cardinality(sinonimos) > 0) AS con_sinonimos,
    count(*) FILTER (WHERE atc_id IS NULL) AS sin_atc,
    count(*) FILTER (WHERE nombre_generico_en IS NULL OR nombre_generico_en = '') AS sin_nombre_en
  FROM moleculas_referencias
`);

// 3. Bridges
await q('bridges', `
  SELECT
    (SELECT count(*) FROM catalogo_moleculas) AS catalogo_moleculas,
    (SELECT count(*) FROM producto_moleculas) AS producto_moleculas,
    (SELECT count(*) FROM moleculas_referencias) AS moleculas_referencias,
    (SELECT count(*) FROM atc_clasificaciones) AS atc_clasificaciones,
    (SELECT count(*) FROM productos_catalogo) AS productos_catalogo
`);

// 4. Ejemplo de filas CON indicaciones
await q('moleculas_ficha_tecnica - muestra con contenido', `
  SELECT molecula_id, cima_nregistro, left(indicaciones_terapeuticas, 100) AS ind_100
  FROM moleculas_ficha_tecnica
  WHERE indicaciones_terapeuticas IS NOT NULL AND indicaciones_terapeuticas <> ''
  LIMIT 5
`);

// 5. Vacías / sin ficha
await q('moleculas_ficha_tecnica - vacías', `
  SELECT count(*) AS filas_con_indicaciones_vacias
  FROM moleculas_ficha_tecnica
  WHERE indicaciones_terapeuticas IS NULL OR indicaciones_terapeuticas = ''
`);

await q('moleculas sin ficha alguna', `
  SELECT count(*) AS moleculas_sin_ficha
  FROM moleculas_referencias m
  LEFT JOIN moleculas_ficha_tecnica f ON f.molecula_id = m.id
  WHERE f.id IS NULL
`);

// 6. Rango de ids de ficha vs moleculas
await q('rango moleculas_referencias ids', `
  SELECT min(id) AS min_id, max(id) AS max_id, count(*) AS total FROM moleculas_referencias
`);

// 7. Antonella: fecha de la corrida
await q('ficha - fechas de las filas', `
  SELECT min(created_at) AS primera, max(created_at) AS ultima, count(DISTINCT date_trunc('day', created_at)) AS dias
  FROM moleculas_ficha_tecnica
`);

await c.end();