import 'dotenv/config';
import pg from 'pg';
import { parsearDescripcion, construirIndice, candidatosPara } from './lib/cobecaParser.mjs';

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

console.log('molTokens:', parsed.molTokens);
console.log('forma:', parsed.forma);
console.log('labToken:', parsed.labToken);

const cands = candidatosPara(parsed, idx);
console.log('candCount:', cands.length);

// Check if any TERAGRIP product is in candidates
const teraCands = cands.filter(p => /teragrip/i.test(p.nombre_comercial));
console.log('TERAGRIP in cands:', teraCands.map(p => `${p.id}:${p.nombre_comercial}`));

// Manual trace: what does the loose expansion find for "teragrip"?
const clave = 'teragrip';
const keys = [...idx.keys()];
const looseMatches = keys.filter(k => clave.includes(k) || k.includes(clave));
console.log('loose matches for "teragrip":', looseMatches);
for (const k of looseMatches) {
  console.log(`  ${k} => [${idx.get(k).map(p => p.id).join(',')}]`);
}