import 'dotenv/config';
import pg from 'pg';
import { parsearDescripcion, construirIndice, expandirAbreviatura } from './lib/cobecaParser.mjs';

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
const desc = 'TERAGRIP FORTE GRANU 650/4MG NOCH X6 FAR';
const parsed = parsearDescripcion(desc);
parsed._raw = desc;

// Replicate candidatosPara logic step by step
const set = new Map();
const keys = [...idx.keys()];
console.log('molTokens:', parsed.molTokens);

for (const tok of parsed.molTokens) {
  const clave = expandirAbreviatura(tok);
  console.log(`\nToken: "${tok}" => clave: "${clave}" (len=${clave.length})`);
  if (clave.length < 3) { console.log('  SKIP: too short'); continue; }
  const exactos = idx.get(clave);
  console.log(`  exactos: ${exactos ? exactos.length : 'null'}`);
  const lista = exactos
    ? exactos
    : keys.filter((k) => clave.includes(k) || k.includes(clave));
  console.log(`  lista length: ${lista.length}`);
  if (lista.length > 0 && lista.length < 20) {
    console.log(`  lista ids: [${lista.map(p => p.id).join(',')}]`);
  }
  for (const p of lista) {
    set.set(p.id, { p, coincidencias: (set.get(p.id)?.coincidencias || 0) + 1 });
  }
  console.log(`  set size after: ${set.size}`);
}

console.log('\nFinal set size:', set.size);
const teraInSet = [...set.values()].filter(e => /teragrip/i.test(e.p.nombre_comercial));
console.log('TERAGRIP in set:', teraInSet.map(e => e.p.id));