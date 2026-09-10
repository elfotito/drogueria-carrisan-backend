// scripts/reporte-sin-ficha.mjs
// Reporte: moleculas_referencias SIN ficha tecnica CIMA -> CSV para el dueno.
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres', user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = (await c.query(`
  SELECT m.id, m.nombre, COALESCE(m.nombre_generico_en, '') AS name_en, m.atc_id,
         COALESCE(a.codigo, '') AS atc,
         COALESCE(pc.n_efs, 0) AS efs_catalogo,
         COALESCE(tt.n_tienda, 0) AS productos_tienda
  FROM moleculas_referencias m
  LEFT JOIN atc_clasificaciones a ON a.id = m.atc_id
  LEFT JOIN (SELECT molecula_id, count(DISTINCT producto_catalogo_id) AS n_efs FROM catalogo_moleculas GROUP BY 1) pc ON pc.molecula_id = m.id
  LEFT JOIN (SELECT pm.molecula_id, count(DISTINCT pm.producto_id) AS n_tienda FROM producto_moleculas pm GROUP BY 1) tt ON tt.molecula_id = m.id
  WHERE NOT EXISTS (SELECT 1 FROM moleculas_ficha_tecnica f WHERE f.molecula_id = m.id)
  ORDER BY COALESCE(pc.n_efs, 0) DESC, COALESCE(tt.n_tienda, 0) DESC, m.nombre
`)).rows;

function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
const header = ['id', 'nombre', 'nombre_generico_en', 'atc', 'efs_catalogo', 'productos_tienda'];
const lines = [header.join(',')];
for (const x of r) lines.push(header.map((h) => csvEscape(x[h])).join(','));
const OUT = path.join(ROOT, 'data', `moleculas_sin_ficha_${new Date().toISOString().slice(0, 10)}.csv`);
fs.writeFileSync(OUT, lines.join('\n') + '\n');

console.log('sin ficha tecnica:', r.length);
const conUso = r.filter((x) => x.efs_catalogo > 0 || x.productos_tienda > 0);
console.log('con uso en catalogo/tienda (prioritarias):', conUso.length);
const soloCat = r.filter((x) => x.efs_catalogo > 0);
console.log('con uso en catalogo INHRR:', soloCat.length);
console.log('absolutamente sin uso:', r.length - conUso.length);
console.log('CSV:', OUT);
for (const x of conUso.slice(0, 15)) console.log(`  ${x.nombre} (atc ${x.atc}) efs=${x.efs_catalogo} tienda=${x.productos_tienda}`);
await c.end();