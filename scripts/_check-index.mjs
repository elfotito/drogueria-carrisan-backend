import 'dotenv/config';
import pg from 'pg';
import { construirIndice } from './lib/cobecaParser.mjs';

const DB_CONFIG = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const client = new pg.Client(DB_CONFIG);
await client.connect();
const { rows: productos } = await client.query(
  `SELECT id, nombre_comercial, molecula, forma, laboratorio FROM public.productos WHERE activo = true ORDER BY id`
);
await client.end();

const idx = construirIndice(productos);
const keys = [...idx.keys()];

// Find keys containing "teragrip"
const teraKeys = keys.filter(k => k.includes('teragrip'));
console.log('Keys containing "teragrip":', teraKeys);
for (const k of teraKeys) {
  const prods = idx.get(k);
  console.log(`  ${k} => [${prods.map(p => p.id).join(',')}]`);
}

// Find keys containing "tachipirin"
const tachiKeys = keys.filter(k => k.includes('tachipirin'));
console.log('\nKeys containing "tachipirin":', tachiKeys);
for (const k of tachiKeys) {
  const prods = idx.get(k);
  console.log(`  ${k} => [${prods.map(p => p.id).join(',')}]`);
}

// Check how 38853 would be tokenized for index
const p = productos.find(x => x.id === 38853);
console.log('\nProduct 38853:', p?.nombre_comercial);
console.log('Product 39388:', productos.find(x => x.id === 39388)?.nombre_comercial);
console.log('Product 39381:', productos.find(x => x.id === 39381)?.nombre_comercial);
console.log('Product 39378:', productos.find(x => x.id === 39378)?.nombre_comercial);
console.log('\nTotal keys:', keys.length);
console.log('Total products:', productos.length);