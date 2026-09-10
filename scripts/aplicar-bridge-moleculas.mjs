// scripts/aplicar-bridge-moleculas.mjs
// Task C final: regenera catalogo_moleculas (bridge) en BD desde
// data/catalogo_moleculas_import.csv, igual que cargar-catalogo.sql seccion 2.
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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
const csvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'catalogo_moleculas_import.csv');
const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
const filas = [];
for (let i = 1; i < lines.length; i++) {
  const [ef, molInhrr, molCima, score] = lines[i].split(',');
  if (ef && molCima) filas.push([ef, molCima, score]);
}
console.log('filas bridge a cargar:', filas.length);

try {
  await c.query('BEGIN');
  await c.query('TRUNCATE catalogo_moleculas');

  // Resolver id de moleculas por nombre en memoria (4.3k) y ef de productos
  const mols = (await c.query(`SELECT id, nombre FROM moleculas_referencias`)).rows;
  const molById = new Map(mols.map((m) => [m.nombre, m.id]));
  const prods = (await c.query(`SELECT id, ef FROM productos_catalogo`)).rows;
  const prodById = new Map(prods.map((p) => [p.ef, p.id]));

  const rowsList = [];
  let skip = 0;
  const seen = new Set();
  for (const [ef, mol, score] of filas) {
    const prod = prodById.get(ef), molid = molById.get(mol);
    if (!prod || !molid) { skip++; continue; }
    if (seen.has(`${prod}:${molid}`)) continue;
    seen.add(`${prod}:${molid}`);
    rowsList.push([prod, molid, score === '' ? null : score]);
  }

  // bulk en lotes de 500 con VALUES
  for (let i = 0; i < rowsList.length; i += 500) {
    const chunk = rowsList.slice(i, i + 500);
    const values = chunk.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3}::numeric)`).join(',');
    const params = chunk.flat();
    await c.query(`INSERT INTO catalogo_moleculas (producto_catalogo_id, molecula_id, score) VALUES ${values}`, params);
  }
  await c.query('COMMIT');
  console.log(`Bridge cargado: ${rowsList.length} enlaces (${skip} sin match ef/mol).`);

  const estado = (await c.query(`
    SELECT
      (SELECT count(*) FROM catalogo_moleculas) AS bridge,
      (SELECT count(*) FROM productos_catalogo WHERE activo) AS productos,
      (SELECT count(*) FROM productos_catalogo p WHERE p.activo
        AND NOT EXISTS (SELECT 1 FROM catalogo_moleculas cm WHERE cm.producto_catalogo_id = p.id)) AS productos_sin_molecula,
      (SELECT count(*) FROM moleculas_referencias) AS moleculas,
      (SELECT count(*) FROM moleculas_referencias WHERE atc_id IS NULL) AS moleculas_sin_atc
  `)).rows[0];
  console.log('Estado BD:', estado);
} catch (err) {
  await c.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', err.message);
  process.exit(1);
} finally {
  await c.end();
}