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

const { rows } = await c.query(`
  SELECT m.id, m.nombre, m.nombre_generico_en, m.sinonimos, m.descripcion,
         m.atc_id, a.codigo AS atc_codigo
  FROM moleculas_referencias m
  LEFT JOIN atc_clasificaciones a ON a.id = m.atc_id
  ORDER BY m.id
`);

const outPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'moleculas_referencias_dump.json');
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf-8');
console.log(`Dump: ${rows.length} moléculas -> ${outPath}`);

await c.end();