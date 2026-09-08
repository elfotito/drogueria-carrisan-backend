import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

// 1. Todas las tablas del schema public
const tablas = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);
console.log('=== TABLAS public ===');
console.log(tablas.rows.map(r => r.table_name).join(', '));

// 2. Tablas que mencionan "presentacion"
const pres = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name ILIKE '%presentac%'
`);
console.log('\n=== TABLAS con "presentac" ===');
console.log(pres.rows.length ? pres.rows.map(r=>r.table_name).join(', ') : '(ninguna)');

// 3. Columnas que mencionan "presentacion" o "envase" o "tamanio" o "cantidad_presentacion"
const cols = await client.query(`
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (column_name ILIKE '%presentac%' OR column_name ILIKE '%envase%' OR column_name ILIKE '%tamanio%')
  ORDER BY table_name, column_name
`);
console.log('\n=== Columnas presentacion/envase/tamanio ===');
if (!cols.rows.length) console.log('(ninguna)');
for (const r of cols.rows) console.log(`${r.table_name}.${r.column_name} (${r.data_type})`);

// 4. Columnas de productos (para confirmar schema actual)
const prodCols = await client.query(`
  SELECT column_name, data_type, is_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='productos' ORDER BY ordinal_position
`);
console.log('\n=== COLUMNAS productos ===');
for (const r of prodCols.rows) console.log(`${r.column_name} (${r.data_type}, null=${r.is_nullable})`);

// 5. Columnas de productos_catalogo (INHRR, la fuente del catálogo)
const catCols = await client.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='productos_catalogo' ORDER BY ordinal_position
`);
console.log('\n=== COLUMNAS productos_catalogo (INHRR) ===');
for (const r of catCols.rows) console.log(`${r.column_name} (${r.data_type})`);

await client.end();