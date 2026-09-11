import 'dotenv/config';
import pg from 'pg';

const db = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const ids = [38822, 38853, 38854, 38855, 39159, 39377, 39378, 39380, 39381, 39388, 39389, 39390, 39391];
const { rows } = await db.query(
  `SELECT p.id, p.nombre_comercial AS nombre, p.molecula, p.forma, p.unidades_por_presentacion AS pack, p.sku,
          CASE WHEN p.foto_url IS NOT NULL THEN 'SI' ELSE 'SIN' END AS foto,
          substr(p.foto_url, strpos(p.foto_url,'/') + 1) AS archivo
     FROM productos p
    WHERE p.activo = true AND p.id = ANY($1::int[])
    ORDER BY p.id`,
  [ids]
);
for (const r of rows) {
  console.log(`${String(r.id).padStart(5)} | foto ${r.foto} | ${String(r.archivo || '').padEnd(12)} | ${r.sku}\t${r.nombre} | ${r.molecula} | ${r.forma} | pack=${r.pack}`);
}
await db.end();
console.log('\nFilas del reporte (data/fotos_cobeca_carga.csv):');
import fs from 'fs';
const lines = fs.readFileSync('data/fotos_cobeca_carga.csv', 'utf8').split(/\r?\n/);
const header = lines[0].split(',');
const iId = header.indexOf('producto_id');
const iDesc = header.indexOf('desc_cobeca');
const iScore = header.indexOf('score');
const iF = header.indexOf('foto_url');
console.log(`cabecera: ${header.join(',')}`);
for (const line of lines.slice(1)) {
  if (!line) continue;
  const cols = line.split(',');
  if (ids.includes(Number(cols[iId]))) console.log(`  ${cols[iId].padStart(5)} | ${cols[iDesc].padEnd(60)} | score=${cols[iScore]} | ${cols[iF]}`);
}