import 'dotenv/config';
import pg from 'pg';
import { parsearDescripcion, matchScore, construirIndice, candidatosPara, tieneAncla } from './lib/cobecaParser.mjs';

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
  if (!parsed.forma) { console.log(`\n>>> ${desc}\n    NO FORMA`); continue; }
  const cands = candidatosPara(parsed, idx);
  const scored = cands.map((p) => ({ p, s: matchScore(parsed, p), anc: tieneAncla(parsed, p) }));
  scored.sort((a, b) => (b.s ?? -1) - (a.s ?? -1));

  console.log(`\n>>> ${desc}`);
  console.log(`    candCount=${cands.length} forma=${parsed.forma} mol=[${parsed.molTokens.join(',')}] lab=${parsed.labToken}`);

  const WANT = /teragrip|tachipirin|angrip/i;
  for (const { p, s, anc } of scored.slice(0, 10)) {
    if (WANT.test(p.nombre_comercial) || s >= 0.5) {
      console.log(`    ${String(p.id).padStart(5)} ${(s === -1 ? '  REJECT' : s.toFixed(3))}${anc ? '*' : ' '} ${p.nombre_comercial.substring(0, 70)}`);
    }
  }
  const teraCount = scored.filter(({ p }) => /teragrip/i.test(p.nombre_comercial)).length;
  const tachiCount = scored.filter(({ p }) => /tachipirin/i.test(p.nombre_comercial)).length;
  console.log(`    --- teragrip=${teraCount} tachipirin=${tachiCount} in candidates`);
}