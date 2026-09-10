// scripts/propagar-moleculas-tienda.mjs
// Task D: re-propaga producto_moleculas desde catalogo_moleculas (puente por ef).
// Solo inserta los enlaces FALTANTES (ON CONFLICT DO NOTHING); no borra nada.
// Logica equivalente al bloque "Bridge producto_moleculas" de reconstruir-catalogo.mjs
// pero leyendo el puente ya actualizado de catalogo_moleculas en BD.
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres', user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});
await c.connect();

try {
  // enlaces objetivo: productos tienda (por fuente_inhrr_ef) x moleculas del catalogo (por ef)
  const objetivo = (await c.query(`
    SELECT DISTINCT p.id AS producto_id, cm.molecula_id
    FROM productos p
    JOIN productos_catalogo pc ON pc.ef = p.fuente_inhrr_ef
    JOIN catalogo_moleculas cm ON cm.producto_catalogo_id = pc.id
    WHERE p.fuente_inhrr_ef IS NOT NULL
  `)).rows;

  const existentes = await c.query(`SELECT DISTINCT producto_id, molecula_id FROM producto_moleculas`);
  const existeSet = new Set(existentes.rows.map((r) => `${r.producto_id}:${r.molecula_id}`));
  const faltantes = objetivo.filter((r) => !existeSet.has(`${r.producto_id}:${r.molecula_id}`));
  console.log(`objetivo: ${objetivo.length} | ya existen: ${objetivo.length - faltantes.length} | faltantes: ${faltantes.length}`);

  const CHUNK = 500;
  let insertados = 0;
  for (let i = 0; i < faltantes.length; i += CHUNK) {
    const lote = faltantes.slice(i, i + CHUNK);
    const placeholders = [];
    const params = [];
    let n = 1;
    for (const r of lote) {
      placeholders.push(`($${n++},$${n++})`);
      params.push(r.producto_id, r.molecula_id);
    }
    const res = await c.query(`
      INSERT INTO public.producto_moleculas (producto_id, molecula_id)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (producto_id, molecula_id) DO NOTHING
      RETURNING id
    `, params);
    insertados += res.rows.length;
  }
  console.log(`insertados: ${insertados}`);

  const estado = (await c.query(`
    WITH actual AS (SELECT DISTINCT producto_id FROM producto_moleculas)
    SELECT
      (SELECT count(*) FROM producto_moleculas) AS bridge,
      (SELECT count(*) FROM actual) AS con_molecula,
      (SELECT count(*) FROM productos p WHERE p.fuente_inhrr_ef IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM actual a WHERE a.producto_id = p.id)) AS productos_sin_molecula
  `)).rows[0];
  console.log('Estado tienda:', JSON.stringify(estado));
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
} finally {
  await c.end();
}