// scripts/aplicar-atc.mjs
// Aplica data/moleculas_atc_updates_2026-09-09.sql (Task B, updates "auto") a la BD.
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
const sql = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'moleculas_atc_updates_2026-09-09.sql'), 'utf-8');
const stmts = sql.split(';').map((s) => s.trim()).filter(Boolean);

try {
  await c.query('BEGIN');
  let rows = 0;
  for (const stmt of stmts) {
    const res = await c.query(stmt);
    rows += res.rowCount || 0;
  }
  await c.query('COMMIT');
  console.log(`Aplicados ${stmts.length} statements, ${rows} filas actualizadas.`);

  const valor = await c.query(`
    SELECT count(*) FILTER (WHERE atc_id IS NULL) AS sin_atc,
           count(*) FILTER (WHERE atc_id IS NOT NULL) AS con_atc,
           count(*) AS total
    FROM moleculas_referencias`);
  console.log('Estado moleculas_referencias:', valor.rows[0]);
} catch (err) {
  await c.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', err.message);
  process.exit(1);
} finally {
  await c.end();
}