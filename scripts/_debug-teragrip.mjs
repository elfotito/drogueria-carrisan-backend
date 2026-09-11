import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import { parsearDescripcion, matchScore, construirIndice, candidatosPara } from './lib/cobecaParser.mjs';

const DB_CONFIG = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 5432,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const TARGETS = [
  'TERAGRIP FORTE GRANU 650MG/2MG DIA X6',
  'TERAGRIP FORTE GRANU 650/4MG NOCH X6 FAR',
  'TERAGRIP FORTE TAB REC 650/4 NOCHX4 FAR',
  'TERAGRIP SUPRA TAB REC 650MG X10 FAR',
  'TACHIPIRIN FORTE JBE PED 120ML ELM',
  'TACHIPIRIN GTS PED 30ML ELM',
];

const client = new pg.Client(DB_CONFIG);
await client.connect();
const { rows: productos } = await client.query(
  `SELECT id, nombre_comercial, molecula, forma, laboratorio FROM public.productos WHERE activo = true ORDER BY id`
);
await client.end();

const idx = construirIndice(productos);

for (const desc of TARGETS) {
  const parsed = parsearDescripcion(desc);
  parsed._raw = desc;
  if (!parsed.forma) { console.log(`\n>>> ${desc}\n    NO FORMA => descartado`); continue; }
  const cands = candidatosPara(parsed, idx);
  const res = cands
    .map((p) => ({ p, d: matchScore(parsed, p, true) }))
    .sort((a, b) => (b.d.fin ?? b.d.final ?? -1) - (a.d.fin ?? a.d.final ?? -1))
    .slice(0, 4);
  console.log(`\n>>> ${desc}`);
  console.log(`    forma=${parsed.forma} mol=[${parsed.molTokens.join(',')}] conc=${parsed.conc}${parsed.conc2 ? '/' + parsed.conc2 : ''} combo=${JSON.stringify(parsed.combo)} lab=${parsed.labToken}`);
  for (const { p, d } of res) {
    const fin = d.fin ?? d.final;
    const motivo = d.rejectCombo ? ` [REJECT combo: ${d.rejectCombo}]` : d.rejectDosis ? ` [REJECT dosis: ${d.rejectDosis}]` : '';
    console.log(`    ${String(p.id).padStart(5)} ${String(fin?.toFixed ? fin.toFixed(3) : fin).padStart(6)}${motivo} ${p.nombre_comercial} (${p.molecula}|${p.forma})`);
  }
}